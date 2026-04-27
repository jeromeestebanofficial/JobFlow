"""
LinkedIn Easy Apply automation endpoints with DB-backed queue.
"""
import asyncio
import json
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models.application import Application
from app.models.auto_apply_task import AutoApplyTask
from app.models.job import Job
from app.models.resume import Resume
from app.models.user import User
from app.routers.deps import get_current_user
from app.routers.jobs import _get_default_resume, _resume_to_dict
from app.utils.security import decrypt_data, encrypt_data

router = APIRouter(prefix="/auto-apply", tags=["auto-apply"])

_running_users: set[int] = set()
_ephemeral_tasks: dict[str, dict] = {}


class LinkedInCredentials(BaseModel):
    email: str
    password: str


class ApplyRequest(BaseModel):
    resume_id: Optional[int] = None
    cover_letter: str = ""
    phone: str = ""
    tailored_resume: Optional[dict] = None


class LinkedInQuestionnaire(BaseModel):
    work_authorization: Optional[str] = ""
    visa_sponsorship: Optional[str] = ""
    valid_work_pass: Optional[str] = ""
    years_experience: Optional[str] = ""
    language_proficiency: Optional[str] = ""
    completed_degree: Optional[str] = ""
    expected_salary: Optional[str] = ""
    commute_ok: Optional[str] = ""
    work_setting_ok: Optional[str] = ""
    notice_period: Optional[str] = ""
    gender: Optional[str] = ""
    race_ethnicity: Optional[str] = ""
    protected_veteran: Optional[str] = ""
    disability: Optional[str] = ""
    why_join: Optional[str] = ""
    project_example: Optional[str] = ""
    portfolio_link: Optional[str] = ""


def _is_linkedin_unavailable_error(msg: str) -> bool:
    m = (msg or "").lower()
    markers = [
        "unable to load the page",
        "job id provided may not be valid",
        "job posting has been removed",
        "job is unavailable or removed",
        "this job is no longer available",
    ]
    return any(k in m for k in markers)


def _get_linkedin_questionnaire(keys: dict) -> dict:
    q = keys.get("linkedin_easy_apply_questionnaire")
    return q if isinstance(q, dict) else {}


def _append_task_message(task: AutoApplyTask, msg: str):
    messages = []
    if task.messages:
        try:
            messages = json.loads(task.messages)
        except Exception:
            messages = []
    messages.append(msg)
    task.messages = json.dumps(messages[-200:])


def _ensure_application_for_task(db: Session, task: AutoApplyTask, resume_id: Optional[int]):
    app = db.query(Application).filter(
        Application.user_id == task.user_id,
        Application.job_id == task.job_id,
    ).first()
    if not app:
        app = Application(
            user_id=task.user_id,
            job_id=task.job_id,
            resume_id=resume_id,
            status="pending",
            is_auto_applied=True,
            auto_apply_status="queued",
            auto_apply_task_id=task.id,
            notes="Queued for LinkedIn Easy Apply automation",
        )
        db.add(app)
    else:
        app.is_auto_applied = True
        app.auto_apply_status = "queued"
        app.auto_apply_task_id = task.id
        app.auto_apply_error = None
    db.commit()


async def _run_user_queue(user_id: int):
    if user_id in _running_users:
        return
    _running_users.add(user_id)
    try:
        while True:
            db = SessionLocal()
            task = (
                db.query(AutoApplyTask)
                .filter(AutoApplyTask.user_id == user_id, AutoApplyTask.status == "queued")
                .order_by(AutoApplyTask.created_at.asc())
                .first()
            )
            if not task:
                db.close()
                break

            task.status = "running"
            task.current_step = "Starting"
            task.progress = 5
            task.started_at = datetime.utcnow()
            _append_task_message(task, "Task started")
            db.commit()

            app = db.query(Application).filter(
                Application.user_id == user_id,
                Application.job_id == task.job_id,
            ).first()
            if app:
                app.auto_apply_status = "running"
                app.auto_apply_task_id = task.id
                app.auto_apply_error = None
                db.commit()

            try:
                user = db.query(User).filter(User.id == user_id).first()
                job = db.query(Job).filter(Job.id == task.job_id).first()
                resume = (
                    db.query(Resume).filter(Resume.id == task.resume_id, Resume.user_id == user_id).first()
                    if task.resume_id
                    else _get_default_resume(user_id, db)
                )
                if not user or not job or not resume:
                    raise RuntimeError("Task dependencies missing (user/job/resume)")
                if not user.api_keys_encrypted:
                    raise RuntimeError("LinkedIn credentials not configured")
                try:
                    keys = decrypt_data(user.api_keys_encrypted)
                except Exception:
                    raise RuntimeError("Failed to decrypt LinkedIn credentials")
                li_email = keys.get("linkedin_email")
                li_password = keys.get("linkedin_password")
                questionnaire = _get_linkedin_questionnaire(keys)
                if not li_email or not li_password:
                    raise RuntimeError("LinkedIn credentials not configured")

                if task.tailored_resume_json:
                    try:
                        resume_data = json.loads(task.tailored_resume_json)
                    except Exception:
                        resume_data = _resume_to_dict(resume)
                else:
                    resume_data = _resume_to_dict(resume)
                from app.services.auto_apply.linkedin import linkedin_easy_apply

                async def status_callback(msg: str):
                    status_db = SessionLocal()
                    try:
                        t = status_db.query(AutoApplyTask).filter(AutoApplyTask.id == task.id).first()
                        if not t:
                            return
                        _append_task_message(t, msg)
                        t.current_step = msg[:120]
                        t.progress = min(95, max(t.progress or 5, (t.progress or 5) + 5))
                        status_db.commit()
                    finally:
                        status_db.close()

                result = await linkedin_easy_apply(
                    job_url=job.url or "",
                    email=li_email,
                    password=li_password,
                    resume_data=resume_data,
                    cover_letter=task.cover_letter or "",
                    phone=task.phone or resume_data.get("phone", ""),
                    qa_profile=questionnaire,
                    session_id=f"user_{user_id}",
                    status_callback=status_callback,
                )

                done_db = SessionLocal()
                try:
                    t = done_db.query(AutoApplyTask).filter(AutoApplyTask.id == task.id).first()
                    a = done_db.query(Application).filter(
                        Application.user_id == user_id,
                        Application.job_id == task.job_id,
                    ).first()
                    if result.get("success"):
                        t.status = "done"
                        t.current_step = "Submitted"
                        t.progress = 100
                        t.result_json = json.dumps(result)
                        t.finished_at = datetime.utcnow()
                        if a:
                            a.status = "applied"
                            a.applied_at = datetime.utcnow()
                            a.is_auto_applied = True
                            a.auto_apply_status = "done"
                            a.auto_apply_error = None
                    else:
                        msg = result.get("message") or "Auto-apply failed"
                        t.status = "error"
                        t.current_step = f"Failed: {msg[:80]}"
                        t.progress = 100
                        t.error_message = msg
                        t.result_json = json.dumps(result)
                        _append_task_message(t, f"Error: {msg}")
                        t.finished_at = datetime.utcnow()
                        if a:
                            if _is_linkedin_unavailable_error(msg):
                                a.status = "skipped"
                                a.auto_apply_status = "cancelled"
                                a.auto_apply_error = "LinkedIn job unavailable/removed. Skipped."
                            else:
                                a.auto_apply_status = "error"
                                a.auto_apply_error = msg
                    if _is_linkedin_unavailable_error(msg):
                        j = done_db.query(Job).filter(Job.id == task.job_id).first()
                        if j:
                            j.is_active = False
                            if not j.expires_at:
                                j.expires_at = datetime.utcnow()
                        _append_task_message(t, "Job marked unavailable; skipping to next queued record")
                    done_db.commit()
                finally:
                    done_db.close()
            except Exception as e:
                err_db = SessionLocal()
                try:
                    t = err_db.query(AutoApplyTask).filter(AutoApplyTask.id == task.id).first()
                    if t:
                        t.status = "error"
                        t.current_step = f"Failed: {str(e)[:80]}"
                        t.progress = 100
                        t.error_message = str(e)
                        t.result_json = json.dumps({"success": False, "message": str(e)})
                        _append_task_message(t, f"Error: {str(e)}")
                        t.finished_at = datetime.utcnow()
                    a = err_db.query(Application).filter(
                        Application.user_id == user_id,
                        Application.job_id == task.job_id,
                    ).first()
                    if a:
                        a.auto_apply_status = "error"
                        a.auto_apply_error = str(e)
                    err_db.commit()
                finally:
                    err_db.close()
            finally:
                db.close()
    finally:
        _running_users.discard(user_id)


# ── Credential management ────────────────────────────────────────────────────

@router.post("/credentials")
def save_linkedin_credentials(
    data: LinkedInCredentials,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing: dict = {}
    if user.api_keys_encrypted:
        try:
            existing = decrypt_data(user.api_keys_encrypted)
        except Exception:
            pass
    existing["linkedin_email"] = data.email
    existing["linkedin_password"] = data.password
    user.api_keys_encrypted = encrypt_data(existing)
    db.commit()
    return {"message": "LinkedIn credentials saved"}


@router.get("/credentials")
def get_linkedin_credentials_status(user: User = Depends(get_current_user)):
    if not user.api_keys_encrypted:
        return {"configured": False, "email_hint": None}
    try:
        keys = decrypt_data(user.api_keys_encrypted)
        li_email = keys.get("linkedin_email", "")
        li_pw = keys.get("linkedin_password", "")
        configured = bool(li_email and li_pw)
        email_hint = (li_email[:3] + "***@" + li_email.split("@")[-1]) if configured else None
        return {"configured": configured, "email_hint": email_hint}
    except Exception:
        return {"configured": False, "email_hint": None}


@router.get("/questionnaire")
def get_linkedin_questionnaire(user: User = Depends(get_current_user)):
    if not user.api_keys_encrypted:
        return {}
    try:
        keys = decrypt_data(user.api_keys_encrypted)
    except Exception:
        return {}
    return _get_linkedin_questionnaire(keys)


@router.put("/questionnaire")
def save_linkedin_questionnaire(
    data: LinkedInQuestionnaire,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    existing: dict = {}
    if user.api_keys_encrypted:
        try:
            existing = decrypt_data(user.api_keys_encrypted)
        except Exception:
            existing = {}
    existing["linkedin_easy_apply_questionnaire"] = data.model_dump()
    user.api_keys_encrypted = encrypt_data(existing)
    db.commit()
    return {"message": "LinkedIn questionnaire saved"}


@router.delete("/credentials")
def delete_linkedin_credentials(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not user.api_keys_encrypted:
        raise HTTPException(status_code=404, detail="No credentials stored")
    try:
        keys = decrypt_data(user.api_keys_encrypted)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt")
    keys.pop("linkedin_email", None)
    keys.pop("linkedin_password", None)
    user.api_keys_encrypted = encrypt_data(keys) if keys else None
    db.commit()
    return {"message": "LinkedIn credentials removed"}


# ── Auto-apply trigger ───────────────────────────────────────────────────────

@router.post("/apply/{job_id}")
async def trigger_auto_apply(
    job_id: int,
    data: Optional[ApplyRequest] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = data or ApplyRequest()
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    job_url = job.url or ""
    if "linkedin.com" not in job_url:
        raise HTTPException(
            status_code=400,
            detail="This job doesn't have a LinkedIn URL. LinkedIn Easy Apply only works on LinkedIn jobs.",
        )
    if not user.api_keys_encrypted:
        raise HTTPException(status_code=400, detail="LinkedIn credentials not configured — add them in Settings")
    try:
        keys = decrypt_data(user.api_keys_encrypted)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt credentials")
    if not keys.get("linkedin_email") or not keys.get("linkedin_password"):
        raise HTTPException(status_code=400, detail="LinkedIn credentials not configured — add them in Settings")

    resume = (
        db.query(Resume).filter(Resume.id == data.resume_id, Resume.user_id == user.id).first()
        if data.resume_id
        else _get_default_resume(user.id, db)
    )
    if not resume:
        raise HTTPException(status_code=404, detail="No resume found — create one in Resume Builder first")

    task_id = str(uuid.uuid4())
    task = AutoApplyTask(
        id=task_id,
        user_id=user.id,
        job_id=job_id,
        resume_id=resume.id,
        status="queued",
        current_step="Queued",
        progress=0,
        cover_letter=data.cover_letter or "",
        phone=data.phone or "",
        tailored_resume_json=(json.dumps(data.tailored_resume) if data.tailored_resume else None),
        messages=json.dumps(["Queued"]),
    )
    db.add(task)
    db.commit()
    _ensure_application_for_task(db, task, resume.id)

    asyncio.create_task(_run_user_queue(user.id))
    return {"task_id": task_id, "status": "queued"}


# ── Apply by raw URL (no job_id needed) ─────────────────────────────────────

class ApplyByUrlRequest(BaseModel):
    job_url: str
    cover_letter: str = ""
    phone: str = ""
    resume_id: Optional[int] = None


@router.post("/apply-by-url")
async def trigger_apply_by_url(
    data: ApplyByUrlRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if "linkedin.com" not in data.job_url:
        raise HTTPException(
            status_code=400,
            detail="Only LinkedIn job URLs are supported for Easy Apply automation.",
        )
    if not user.api_keys_encrypted:
        raise HTTPException(status_code=400, detail="LinkedIn credentials not configured — add them in Settings")
    try:
        keys = decrypt_data(user.api_keys_encrypted)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt credentials")
    li_email = keys.get("linkedin_email")
    li_password = keys.get("linkedin_password")
    questionnaire = _get_linkedin_questionnaire(keys)
    if not li_email or not li_password:
        raise HTTPException(status_code=400, detail="LinkedIn credentials not configured — add them in Settings")
    resume = (
        db.query(Resume).filter(Resume.id == data.resume_id, Resume.user_id == user.id).first()
        if data.resume_id
        else _get_default_resume(user.id, db)
    )
    if not resume:
        raise HTTPException(status_code=404, detail="No resume found — create one in Resume Builder first")

    task_id = str(uuid.uuid4())
    _ephemeral_tasks[task_id] = {
        "status": "pending",
        "messages": ["Queued"],
        "result": None,
        "current_step": "Queued",
        "progress": 0,
    }
    resume_data = _resume_to_dict(resume)
    from app.services.auto_apply.linkedin import linkedin_easy_apply

    async def status_callback(msg: str):
        task = _ephemeral_tasks.get(task_id)
        if not task:
            return
        task["messages"].append(msg)
        task["status"] = "running"
        task["current_step"] = msg[:120]
        task["progress"] = min(95, max(task["progress"], task["progress"] + 5))

    async def run_apply():
        task = _ephemeral_tasks.get(task_id)
        if not task:
            return
        task["status"] = "running"
        task["current_step"] = "Starting"
        task["progress"] = 5
        try:
            result = await linkedin_easy_apply(
                job_url=data.job_url,
                email=li_email,
                password=li_password,
                resume_data=resume_data,
                cover_letter=data.cover_letter,
                phone=data.phone or resume_data.get("phone", ""),
                qa_profile=questionnaire,
                session_id=f"user_{user.id}",
                status_callback=status_callback,
            )
            task["result"] = result
            task["status"] = "done" if result.get("success") else "error"
            task["current_step"] = "Submitted" if result.get("success") else "Failed"
            task["progress"] = 100
        except Exception as e:
            task["result"] = {"success": False, "message": str(e)}
            task["status"] = "error"
            task["current_step"] = "Failed"
            task["progress"] = 100

    asyncio.create_task(run_apply())
    return {"task_id": task_id, "status": "queued"}


# ── Status polling ───────────────────────────────────────────────────────────

@router.get("/status/{task_id}")
async def get_task_status(task_id: str, user: User = Depends(get_current_user)):
    db = SessionLocal()
    try:
        task = db.query(AutoApplyTask).filter(AutoApplyTask.id == task_id, AutoApplyTask.user_id == user.id).first()
        if task:
            if task.status in {"queued", "running"} and user.id not in _running_users:
                asyncio.create_task(_run_user_queue(user.id))
            messages = []
            if task.messages:
                try:
                    messages = json.loads(task.messages)
                except Exception:
                    messages = []
            result = None
            if task.result_json:
                try:
                    result = json.loads(task.result_json)
                except Exception:
                    result = {"success": task.status == "done", "message": task.error_message or ""}
            return {
                "status": task.status,
                "messages": messages,
                "result": result,
                "current_step": task.current_step,
                "progress": task.progress,
            }
    finally:
        db.close()
    task = _ephemeral_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
