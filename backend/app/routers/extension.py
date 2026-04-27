"""
Chrome Extension API endpoints.

GET  /extension/match?url=<tab_url>   – fuzzy-match current tab URL to a saved tailored draft (includes apply_mode / recommended_apply_url for LinkedIn Easy Apply vs external)
POST /extension/resume-pdf            – return resume.pdf bytes for a given job_id + template
GET  /extension/download              – download the JobFlow Chrome extension as a zip (no auth)
"""
import json
import os
import re
import tempfile
from io import BytesIO
from pathlib import Path
from urllib.parse import parse_qs, urlparse, urlunparse
from zipfile import ZipFile, ZIP_DEFLATED

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document_template import DocumentTemplate
from app.models.job import Job
from app.models.tailored_draft import TailoredDraft
from app.models.user import User
from app.routers.deps import get_current_user
from app.utils.security import decrypt_data

router = APIRouter(prefix="/extension", tags=["extension"])

# Path to the JobFormFiller extension directory (sibling of the project root)
_EXTENSION_DIR = (
    Path(__file__).resolve().parent.parent.parent.parent.parent
    / "Job Filling Chrome Extension"
    / "JobFormFiller"
)


@router.get("/download")
def download_extension():
    """Return the Chrome extension as a zip — no auth required."""
    if not _EXTENSION_DIR.exists():
        raise HTTPException(status_code=404, detail="Extension directory not found on server")

    buf = BytesIO()
    with ZipFile(buf, "w", ZIP_DEFLATED) as zf:
        for file_path in _EXTENSION_DIR.rglob("*"):
            if file_path.is_file():
                arcname = file_path.relative_to(_EXTENSION_DIR).as_posix()
                zf.write(file_path, arcname=arcname)
    buf.seek(0)

    return Response(
        content=buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="JobFlow-Extension.zip"'},
    )


def _strip_www_host(netloc: str) -> str:
    n = (netloc or "").lower()
    return n[4:] if n.startswith("www.") else n


def _canonical_host_for_match(netloc: str) -> str:
    """Treat www.linkedin.com, sg.linkedin.com, etc. as the same host for matching."""
    h = _strip_www_host(netloc or "").lower()
    if h.endswith("linkedin.com"):
        return "linkedin.com"
    return h


def _normalize_url_for_match(raw: str) -> str:
    """
    Canonical form for comparing job URLs: https, no www, path without trailing slash, no query/fragment.
    Fixes mismatches between linkedin.com vs www.linkedin.com and http vs https.
    """
    try:
        p = urlparse(raw.strip())
        if not p.netloc:
            return raw.lower().strip()
        host = _canonical_host_for_match(p.netloc)
        path = (p.path or "").rstrip("/") or "/"
        return urlunparse(("https", host, path, "", "", ""))
    except Exception:
        return raw.lower().strip()


_LI_JOBS_VIEW_ID = re.compile(r"/jobs/view/(\d+)", re.IGNORECASE)


def _linkedin_job_posting_id(url: str) -> str | None:
    """
    LinkedIn uses:
    - /jobs/view/1234567890 (numeric only)
    - /jobs/view/title-slug-4404044144 (SEO slug; posting id is the trailing -digits segment)
    - search/collection URLs with ?currentJobId=
    """
    try:
        p = urlparse(url.strip())
        if "linkedin.com" not in (p.netloc or "").lower():
            return None
        path = p.path or ""
        m = _LI_JOBS_VIEW_ID.search(path)
        if m:
            return m.group(1)
        parts = [x for x in path.strip("/").split("/") if x]
        if len(parts) >= 3 and parts[0].lower() == "jobs" and parts[1].lower() == "view":
            slug = parts[2]
            m_slug = re.search(r"-(\d{6,})$", slug)
            if m_slug:
                return m_slug.group(1)
        qs = parse_qs(p.query)
        for key in ("currentJobId", "jobId", "postId"):
            if key in qs and qs[key]:
                v = str(qs[key][0]).strip()
                if v.isdigit():
                    return v
        return None
    except Exception:
        return None


def _urls_match_for_tailored_draft(tab_url: str, candidate_url: str) -> tuple[bool, int]:
    """
    Returns (matches, score) where score is 3 exact string, 2 canonical / LinkedIn-id, 1 prefix fallback.
    """
    if not candidate_url or not tab_url:
        return False, 0

    a, b = tab_url.strip(), candidate_url.strip()
    if a == b:
        return True, 3

    na, nb = _normalize_url_for_match(a), _normalize_url_for_match(b)
    if na == nb:
        return True, 2

    id_tab = _linkedin_job_posting_id(a)
    id_cand = _linkedin_job_posting_id(b)
    if id_tab and id_cand and id_tab == id_cand:
        return True, 2

    host_a = _canonical_host_for_match(urlparse(a).netloc or "")
    host_b = _canonical_host_for_match(urlparse(b).netloc or "")
    # Same host, tab path extends stored path (e.g. extra path segments); avoid tiny prefixes
    if host_a == host_b and len(nb) >= 12 and na.startswith(nb):
        return True, 1

    return False, 0


def _linkedin_id_from_job_external_id(external_id: str | None) -> str | None:
    """JobFlow stores LinkedIn jobs as external_id like 'linkedin-{numeric_id}'."""
    if not external_id:
        return None
    e = external_id.strip()
    if not e.startswith("linkedin-"):
        return None
    tail = e[9:]
    return tail if tail.isdigit() else None


def _domain(raw: str) -> str:
    try:
        return urlparse(raw).netloc.lower()
    except Exception:
        return ""


def _is_linkedin_host(netloc: str) -> bool:
    n = (netloc or "").lower()
    return "linkedin.com" in n


def _apply_mode_and_url(job: Job) -> tuple[str, str]:
    """
    Classify how this job should be applied (LinkedIn Easy Apply vs external site).

    Returns (apply_mode, recommended_apply_url) where apply_mode is one of:
    - linkedin_easy: use the LinkedIn job / Easy Apply flow
    - external: open the company or ATS URL (not LinkedIn Easy Apply)
    - other: non-LinkedIn listings or ambiguous — use best available URL
    """
    url = (job.url or "").strip()
    apply_u = (job.apply_url or "").strip()
    listing_li = _is_linkedin_host(_domain(url))

    if not listing_li:
        return "other", apply_u or url

    # LinkedIn job listing: Easy Apply iff stored apply URL is still on linkedin.com
    if apply_u and not _is_linkedin_host(_domain(apply_u)):
        return "external", apply_u

    rec = apply_u or url
    if _is_linkedin_host(_domain(rec)):
        return "linkedin_easy", rec
    return "other", rec or url


@router.get("/match")
def match_url(
    url: str = Query(..., description="Current browser tab URL"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the best matching tailored draft for the given URL, or {matched: false}."""
    # Load all jobs that have a saved tailored draft for this user
    drafts = (
        db.query(TailoredDraft)
        .filter(TailoredDraft.user_id == user.id)
        .all()
    )
    if not drafts:
        return {"matched": False}

    job_ids = [d.job_id for d in drafts]
    jobs = db.query(Job).filter(Job.id.in_(job_ids)).all()
    job_map = {j.id: j for j in jobs}

    best_draft = None
    best_job = None
    best_score = 0  # 3 = exact, 2 = normalized, 1 = domain+path prefix
    tab_li_global = _linkedin_job_posting_id(url)

    for draft in drafts:
        job = job_map.get(draft.job_id)
        if not job:
            continue

        draft_score = 0
        for candidate_url in filter(None, [job.url, job.apply_url]):
            ok, sc = _urls_match_for_tailored_draft(url, candidate_url)
            if ok:
                draft_score = max(draft_score, sc)

        if draft_score < 2:
            ext_li = _linkedin_id_from_job_external_id(job.external_id)
            if tab_li_global and ext_li and tab_li_global == ext_li:
                draft_score = max(draft_score, 2)

        if draft_score > best_score:
            best_draft, best_job, best_score = draft, job, draft_score

        if best_score == 3:
            break

    if not best_draft:
        return {"matched": False}

    apply_mode, recommended_apply_url = _apply_mode_and_url(best_job)

    resume_data = json.loads(best_draft.tailored_resume_json)
    return {
        "matched": True,
        "match_score": best_score,
        "job_id": best_job.id,
        "job_title": best_job.title,
        "company": best_job.company,
        "job_url": best_job.url,
        "apply_mode": apply_mode,
        "recommended_apply_url": recommended_apply_url,
        "linkedin_easy_apply": apply_mode == "linkedin_easy",
        "tailored_resume": resume_data,
        "cover_letter": best_draft.cover_letter,
        "updated_at": best_draft.updated_at.isoformat() if best_draft.updated_at else None,
    }


class ResumePdfRequest(BaseModel):
    job_id: int
    resume_template_slug: str = "classic"


@router.post("/resume-pdf")
def get_resume_pdf(
    data: ResumePdfRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return resume.pdf bytes for uploading to ATS file-input fields."""
    draft = (
        db.query(TailoredDraft)
        .filter(TailoredDraft.user_id == user.id, TailoredDraft.job_id == data.job_id)
        .first()
    )
    if not draft:
        raise HTTPException(status_code=404, detail="No saved tailored draft for this job")

    # Resolve template slug (validate it exists and is active, fall back to first active resume template)
    tpl = (
        db.query(DocumentTemplate)
        .filter(
            DocumentTemplate.template_type == "resume",
            DocumentTemplate.slug == data.resume_template_slug,
            DocumentTemplate.is_active == True,  # noqa: E712
        )
        .first()
    )
    if not tpl:
        tpl = (
            db.query(DocumentTemplate)
            .filter(
                DocumentTemplate.template_type == "resume",
                DocumentTemplate.is_active == True,  # noqa: E712
            )
            .order_by(DocumentTemplate.sort_order)
            .first()
        )
    if not tpl:
        raise HTTPException(status_code=400, detail="No active resume template available")

    from app.services.document_pdf import generate_resume_pdf

    resume_data = json.loads(draft.tailored_resume_json)
    full_name = (resume_data.get("full_name") or "resume").replace(" ", "_").lower()

    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = os.path.join(tmp, f"{full_name}_resume.pdf")
        generate_resume_pdf(resume_data, tpl.slug, pdf_path)
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()

    safe_name = "".join(c if c.isalnum() or c in "._-" else "_" for c in full_name)[:80]
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{safe_name}_resume.pdf"'},
    )


@router.get("/guardrails/{job_id}")
def get_apply_guardrails(
    job_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Apply Guardrails: validate critical fields before submit.
    """
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    draft = (
        db.query(TailoredDraft)
        .filter(TailoredDraft.user_id == user.id, TailoredDraft.job_id == job_id)
        .first()
    )
    if not draft:
        return {
            "ready": False,
            "checks": [{"name": "tailored_draft", "ok": False, "message": "Missing tailored resume draft"}],
        }

    resume_data = {}
    try:
        resume_data = json.loads(draft.tailored_resume_json) if draft.tailored_resume_json else {}
    except Exception:
        resume_data = {}

    checks = []
    checks.append({
        "name": "resume_summary",
        "ok": bool((resume_data.get("summary") or "").strip()),
        "message": "Resume summary should be filled",
    })
    checks.append({
        "name": "resume_experience",
        "ok": bool(resume_data.get("experience")),
        "message": "Experience section should not be empty",
    })
    checks.append({
        "name": "cover_letter",
        "ok": bool((draft.cover_letter or "").strip()),
        "message": "Cover letter should not be empty",
    })
    checks.append({
        "name": "job_description",
        "ok": bool((job.description or "").strip()),
        "message": "Job description missing; verify role requirements manually",
    })

    q = {}
    if user.api_keys_encrypted:
        try:
            keys = decrypt_data(user.api_keys_encrypted)
            q = keys.get("linkedin_questions", {}) if isinstance(keys.get("linkedin_questions"), dict) else {}
        except Exception:
            q = {}
    checks.append({
        "name": "visa_answers",
        "ok": bool((q.get("work_authorization") or "").strip()) and bool((q.get("visa_sponsorship") or "").strip()),
        "message": "Visa/work authorization answers should be set in Settings",
    })
    checks.append({
        "name": "salary_expectation",
        "ok": bool((q.get("expected_salary") or "").strip()) or (job.salary_min is not None or job.salary_max is not None),
        "message": "Salary expectation missing (set expected salary or verify job salary)",
    })

    # For external apply jobs, attachment readiness is crucial.
    is_external = bool(job.apply_url and "linkedin.com" not in (job.apply_url or "").lower())
    checks.append({
        "name": "attachments_ready",
        "ok": bool(draft.tailored_resume_json),
        "message": "Resume attachment is not ready",
    })

    ready = all(c["ok"] for c in checks if c["name"] != "job_description")
    return {
        "ready": ready,
        "apply_mode": "external" if is_external else "linkedin_easy",
        "checks": checks,
    }
