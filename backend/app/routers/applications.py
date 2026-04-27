import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.application import Application
from app.models.document_template import DocumentTemplate
from app.models.job import Job
from app.models.resume import Resume
from app.models.tailored_draft import TailoredDraft
from app.models.user import User
from app.routers.deps import get_current_user
from app.routers.jobs import _job_to_dict, _resume_to_dict, _get_default_resume
from app.services.job_matcher import keyword_score
from app.schemas.application import (
    ApplicationCreate,
    ApplicationUpdate,
    SwipeAction,
    TailorExportRequest,
    TailorRequest,
    TailorDraftSaveRequest,
)
from app.utils.security import decrypt_data

router = APIRouter(prefix="/applications", tags=["applications"])


def _infer_role_type(job: Job) -> str:
    jt = (job.job_type or "").strip().lower()
    if jt:
        return jt
    title = (job.title or "").lower()
    if "data" in title:
        return "data"
    if "backend" in title:
        return "backend"
    if "frontend" in title:
        return "frontend"
    if "full stack" in title or "fullstack" in title:
        return "full-stack"
    return "general"


def _ab_variant(user_id: int, job_id: int) -> str:
    return "A" if ((user_id + job_id) % 2 == 0) else "B"


def _serialize_app(app: Application) -> dict:
    return {
        "id": app.id,
        "status": app.status,
        "match_score": app.match_score,
        "cover_letter": app.cover_letter,
        "notes": app.notes,
        "is_auto_applied": app.is_auto_applied,
        "auto_apply_status": getattr(app, "auto_apply_status", None),
        "auto_apply_task_id": getattr(app, "auto_apply_task_id", None),
        "auto_apply_error": getattr(app, "auto_apply_error", None),
        "applied_at": app.applied_at.isoformat() if app.applied_at else None,
        "created_at": app.created_at.isoformat() if app.created_at else None,
        "job": _job_to_dict(app.job) if app.job else None,
        "resume": (
            {
                "id": app.resume.id,
                "name": app.resume.name,
                "full_name": app.resume.full_name,
            }
            if app.resume
            else None
        ),
    }


@router.get("/")
def list_applications(
    status: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Application).filter(Application.user_id == user.id)
    if status:
        q = q.filter(Application.status == status)
    apps = q.order_by(Application.created_at.desc()).all()
    return [_serialize_app(a) for a in apps]


@router.post("/", status_code=201)
def create_application(
    data: ApplicationCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == data.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    existing = db.query(Application).filter(
        Application.user_id == user.id,
        Application.job_id == data.job_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Already applied to this job")

    app = Application(
        user_id=user.id,
        job_id=data.job_id,
        resume_id=data.resume_id,
        cover_letter=data.cover_letter,
        notes=data.notes,
        status="applied",
        applied_at=datetime.utcnow(),
    )
    db.add(app)
    db.commit()
    db.refresh(app)
    return _serialize_app(app)


@router.post("/swipe")
def swipe(
    data: SwipeAction,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == data.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    existing = db.query(Application).filter(
        Application.user_id == user.id,
        Application.job_id == data.job_id,
    ).first()
    if existing:
        return {"action": data.action, "application_id": existing.id, "status": existing.status}

    status = "applied" if data.action == "right" else "skipped"
    applied_at = datetime.utcnow() if data.action == "right" else None

    app = Application(
        user_id=user.id,
        job_id=data.job_id,
        resume_id=data.resume_id,
        status=status,
        applied_at=applied_at,
        is_auto_applied=False,
    )
    db.add(app)
    db.commit()
    db.refresh(app)
    return {"action": data.action, "application_id": app.id, "status": status}


@router.post("/tailor")
async def tailor_for_job(
    data: TailorRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == data.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    resume = (
        db.query(Resume).filter(Resume.id == data.resume_id, Resume.user_id == user.id).first()
        if data.resume_id
        else _get_default_resume(user.id, db)
    )
    if not resume:
        raise HTTPException(status_code=404, detail="No resume found — create one first")

    from app.services.resume_tailor import tailor_resume, generate_cover_letter
    from app.services.ai_service import pick_provider, PROVIDER_PRIORITY

    api_keys = {}
    decrypt_failed = False
    if user.api_keys_encrypted:
        try:
            api_keys = decrypt_data(user.api_keys_encrypted)
        except Exception:
            decrypt_failed = True

    # Only count actual AI provider keys (not linkedin_email / linkedin_password)
    ai_keys = {k: v for k, v in api_keys.items() if k in PROVIDER_PRIORITY}
    if not ai_keys:
        detail = (
            "API key could not be read — please re-save it in Settings → AI API Keys"
            if decrypt_failed
            else "Add an AI API key (Anthropic, OpenAI, or OpenRouter) in Settings to use AI tailoring"
        )
        raise HTTPException(status_code=400, detail=detail)

    from app.services.ai_service import all_providers

    providers = all_providers(ai_keys)
    if not providers:
        raise HTTPException(status_code=400, detail="No AI provider API key found — add one in Settings")

    resume_data = _resume_to_dict(resume)
    job_dict = _job_to_dict(job)
    base_match_score = round(keyword_score(resume_data, job_dict), 1)
    last_err = ""
    for provider, api_key in providers:
        try:
            tailored = await tailor_resume(
                resume_data, job.title, job.description or "", api_key, provider
            )
            cover_letter = await generate_cover_letter(
                resume_data, job.title, job.company or "", job.description or "", api_key, provider
            )
            tailored_match_score = round(keyword_score(tailored, job_dict), 1)
            return {
                "tailored_resume": tailored,
                "cover_letter": cover_letter,
                "provider_used": provider,
                "base_match_score": base_match_score,
                "tailored_match_score": tailored_match_score,
                "match_delta": round(tailored_match_score - base_match_score, 1),
            }
        except Exception as e:
            cause = e
            if hasattr(e, "last_attempt"):
                try:
                    cause = e.last_attempt.exception()
                except Exception:
                    pass
            http_body = ""
            if hasattr(cause, "response") and cause.response is not None:
                try:
                    http_body = cause.response.text
                except Exception:
                    pass
            last_err = f"{cause} {http_body}".strip()
            continue  # try next provider

    # All providers failed
    if "401" in last_err or "invalid_api_key" in last_err.lower() or "authentication" in last_err.lower():
        raise HTTPException(status_code=400, detail="All API keys are invalid — please re-enter them in Settings")
    if "credit" in last_err.lower() or "billing" in last_err.lower() or "balance" in last_err.lower():
        raise HTTPException(status_code=400, detail="All AI providers are out of credits — top up or add a different key in Settings")
    if "429" in last_err or "rate_limit" in last_err.lower():
        raise HTTPException(status_code=429, detail="All AI providers hit rate limits — try again in a moment")
    raise HTTPException(status_code=500, detail=f"All AI providers failed. Last error: {last_err[:300]}")


@router.get("/tailor/saved-job-ids")
def list_saved_tailor_job_ids(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All job IDs that have a saved tailored resume + cover letter draft for the current user."""
    rows = (
        db.query(TailoredDraft.job_id)
        .filter(TailoredDraft.user_id == user.id)
        .all()
    )
    return {"job_ids": [r[0] for r in rows]}


@router.get("/tailor/saved/{job_id}")
def get_saved_tailor_draft(
    job_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    draft = (
        db.query(TailoredDraft)
        .filter(TailoredDraft.user_id == user.id, TailoredDraft.job_id == job_id)
        .first()
    )
    if not draft:
        return {"saved": False}
    return {
        "saved": True,
        "job_id": job_id,
        "resume_id": draft.resume_id,
        "tailored_resume": json.loads(draft.tailored_resume_json),
        "cover_letter": draft.cover_letter,
        "experiment_variant": draft.experiment_variant,
        "resume_style": draft.resume_style,
        "role_type": draft.role_type,
        "updated_at": draft.updated_at.isoformat() if draft.updated_at else None,
    }


@router.post("/tailor/save")
def save_tailor_draft(
    data: TailorDraftSaveRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == data.job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    draft = (
        db.query(TailoredDraft)
        .filter(TailoredDraft.user_id == user.id, TailoredDraft.job_id == data.job_id)
        .first()
    )
    payload = json.dumps(data.tailored_resume, ensure_ascii=False)
    role_type = _infer_role_type(job)
    variant = _ab_variant(user.id, data.job_id)
    if draft:
        draft.resume_id = data.resume_id
        draft.tailored_resume_json = payload
        draft.cover_letter = data.cover_letter
        draft.role_type = role_type
        draft.experiment_variant = variant
        draft.resume_style = data.resume_style or draft.resume_style
    else:
        draft = TailoredDraft(
            user_id=user.id,
            job_id=data.job_id,
            resume_id=data.resume_id,
            tailored_resume_json=payload,
            cover_letter=data.cover_letter,
            role_type=role_type,
            experiment_variant=variant,
            resume_style=data.resume_style,
        )
        db.add(draft)
    db.commit()
    return {
        "message": "Tailored draft saved",
        "job_id": data.job_id,
        "experiment_variant": variant,
        "resume_style": data.resume_style,
        "role_type": role_type,
    }


@router.get("/experiments/ab")
def ab_experiment_metrics(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Resume Version Experiments (A/B):
    response rate = (interview + offer) / applied-like outcomes, grouped by role type.
    """
    apps = (
        db.query(Application, Job, TailoredDraft)
        .join(Job, Application.job_id == Job.id)
        .outerjoin(
            TailoredDraft,
            (TailoredDraft.user_id == Application.user_id) & (TailoredDraft.job_id == Application.job_id),
        )
        .filter(Application.user_id == user.id)
        .all()
    )
    buckets = {}
    positive = {"interview", "offer"}
    denominator_statuses = {"applied", "interview", "offer", "rejected", "withdrawn"}
    for app, job, draft in apps:
        role_type = (draft.role_type if draft and draft.role_type else _infer_role_type(job))
        variant = (draft.experiment_variant if draft and draft.experiment_variant else _ab_variant(user.id, job.id))
        key = (role_type, variant)
        if key not in buckets:
            buckets[key] = {"role_type": role_type, "variant": variant, "total": 0, "responses": 0}
        if (app.status or "").lower() in denominator_statuses:
            buckets[key]["total"] += 1
            if (app.status or "").lower() in positive:
                buckets[key]["responses"] += 1

    rows = []
    for v in buckets.values():
        total = v["total"]
        responses = v["responses"]
        rows.append({
            **v,
            "response_rate": round((responses / total) * 100, 1) if total else 0.0,
        })
    rows.sort(key=lambda r: (r["role_type"], r["variant"]))
    return {"rows": rows}


@router.post("/tailor/export")
def export_tailored_pdfs(
    data: TailorExportRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Zip: resume.pdf + cover_letter.pdf using chosen templates (requires active template rows)."""
    r_tpl = (
        db.query(DocumentTemplate)
        .filter(
            DocumentTemplate.id == data.resume_template_id,
            DocumentTemplate.template_type == "resume",
            DocumentTemplate.is_active == True,  # noqa: E712
        )
        .first()
    )
    c_tpl = (
        db.query(DocumentTemplate)
        .filter(
            DocumentTemplate.id == data.cover_template_id,
            DocumentTemplate.template_type == "cover_letter",
            DocumentTemplate.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not r_tpl or not c_tpl:
        raise HTTPException(status_code=400, detail="Invalid or inactive template selection")

    from app.services.document_pdf import build_tailored_documents_zip

    zip_bytes = build_tailored_documents_zip(
        data.tailored_resume,
        data.cover_letter,
        r_tpl.slug,
        c_tpl.slug,
        job_title=data.job_title or "",
        company=data.company or "",
    )
    name = (data.tailored_resume.get("full_name") or "application").replace(" ", "_")
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in name)[:80]
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{safe}_tailored_documents.zip"'},
    )


@router.get("/{app_id}")
def get_application(app_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    app = db.query(Application).filter(Application.id == app_id, Application.user_id == user.id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    return _serialize_app(app)


@router.put("/{app_id}")
def update_application(
    app_id: int,
    data: ApplicationUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    app = db.query(Application).filter(Application.id == app_id, Application.user_id == user.id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    for field, val in data.model_dump(exclude_none=True).items():
        setattr(app, field, val)
    db.commit()
    db.refresh(app)
    return _serialize_app(app)


@router.delete("/{app_id}", status_code=204)
def delete_application(app_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    app = db.query(Application).filter(Application.id == app_id, Application.user_id == user.id).first()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    db.delete(app)
    db.commit()
