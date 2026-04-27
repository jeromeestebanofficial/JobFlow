import json
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.models.job import Job
from app.models.resume import Resume
from app.models.user import User
from app.routers.deps import get_current_user
from app.services.job_scraper import fetch_all_jobs, fetch_linkedin_rapidapi
from app.services.job_matcher import keyword_score
from app.utils.security import decrypt_data

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _resolve_rapidapi_settings(user: User) -> tuple[list[str], Optional[str], Optional[str]]:
    api_keys = [settings.RAPIDAPI_KEY] if settings.RAPIDAPI_KEY else []
    api_host = settings.RAPIDAPI_HOST
    api_path = settings.RAPIDAPI_LINKEDIN_PATH
    if user.api_keys_encrypted:
        try:
            keys = decrypt_data(user.api_keys_encrypted)
            stored_multi = keys.get("rapidapi_keys") or []
            if isinstance(stored_multi, list):
                api_keys = [str(k).strip() for k in stored_multi if str(k).strip()] or api_keys
            else:
                legacy = (keys.get("rapidapi_key") or "").strip()
                if legacy:
                    api_keys = [legacy]
            api_host = (keys.get("rapidapi_host") or "").strip() or api_host
            api_path = (keys.get("rapidapi_path") or "").strip() or api_path
        except Exception:
            pass
    return api_keys, api_host, api_path


def _resume_to_dict(resume: Resume) -> dict:
    d = {}
    json_fields = {"skills", "experience", "education", "certifications", "projects"}
    scalar_fields = {"full_name", "email", "phone", "location", "linkedin_url", "github_url", "portfolio_url", "summary"}
    for field in scalar_fields | json_fields:
        val = getattr(resume, field, None)
        if field in json_fields and isinstance(val, str):
            try:
                d[field] = json.loads(val)
            except Exception:
                d[field] = val
        else:
            d[field] = val
    return d


def _job_to_dict(job: Job, match_score: Optional[float] = None) -> dict:
    d = {c.name: getattr(job, c.name) for c in Job.__table__.columns}
    if isinstance(d.get("tags"), str):
        try:
            d["tags"] = json.loads(d["tags"])
        except Exception:
            d["tags"] = []
    # Serialize datetime fields
    for dt_field in ("posted_at", "expires_at", "fetched_at"):
        v = d.get(dt_field)
        if v is not None:
            d[dt_field] = v.isoformat() if hasattr(v, "isoformat") else str(v)
    # Expose whether this LinkedIn posting supports Easy Apply.
    d["is_easy_apply"] = False
    req = getattr(job, "requirements", None)
    if req:
        try:
            req_obj = json.loads(req) if isinstance(req, str) else req
            if isinstance(req_obj, dict):
                external_apply = req_obj.get("external_apply_url")
                d["is_easy_apply"] = bool(
                    req_obj.get("directapply") is True or external_apply in (None, "", "null")
                )
        except Exception:
            pass
    # Availability signal for UI: disable apply actions when likely closed.
    d["is_available"] = bool(getattr(job, "is_active", True))
    d["availability_reason"] = None
    now_utc = datetime.now(timezone.utc)
    expires = getattr(job, "expires_at", None)
    if expires:
        try:
            exp = expires
            if isinstance(exp, str):
                exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
            if getattr(exp, "tzinfo", None) is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp < now_utc:
                d["is_available"] = False
                d["availability_reason"] = "No longer accepting applications"
        except Exception:
            pass
    if not d["is_available"] and not d["availability_reason"]:
        d["availability_reason"] = "Job unavailable"
    if match_score is not None:
        d["match_score"] = round(match_score, 1)
    return d


def _safe_str(v) -> str:
    if v is None:
        return ""
    if isinstance(v, list):
        for x in v:
            sx = str(x).strip()
            if sx:
                return sx
        return ""
    if isinstance(v, dict):
        return json.dumps(v, ensure_ascii=False)
    return str(v).strip()


def _extract_description_from_requirements(raw_requirements) -> str:
    try:
        req = json.loads(raw_requirements) if isinstance(raw_requirements, str) else raw_requirements
        if not isinstance(req, dict):
            return ""
        candidates = [
            req.get("description_text"),
            req.get("description"),
            req.get("job_description"),
            req.get("descriptionHtml"),
            req.get("description_html"),
            req.get("snippet"),
            req.get("summary"),
        ]
        for v in candidates:
            s = _safe_str(v)
            if s:
                return s
    except Exception:
        pass
    return ""


def _upsert_jobs(db: Session, raw_jobs: list) -> List[Job]:
    saved = []
    now = datetime.now(timezone.utc)
    for j in raw_jobs:
        if not j.get("external_id"):
            continue
        existing = db.query(Job).filter(Job.external_id == j["external_id"]).first()
        if existing:
            # Keep DB fresh on every ingest: update mutable fields and refresh timestamp.
            existing.source = _safe_str(j.get("source")) or existing.source
            existing.title = _safe_str(j.get("title")) or existing.title
            existing.company = _safe_str(j.get("company")) or existing.company
            existing.location = _safe_str(j.get("location")) or existing.location
            existing.is_remote = bool(j.get("is_remote", existing.is_remote))
            existing.job_type = _safe_str(j.get("job_type")) or existing.job_type
            existing.salary_min = j.get("salary_min")
            existing.salary_max = j.get("salary_max")
            next_requirements = _safe_str(j.get("requirements")) or existing.requirements
            next_description = _safe_str(j.get("description"))
            if not next_description:
                next_description = _extract_description_from_requirements(next_requirements)
            existing.description = next_description or existing.description
            existing.requirements = next_requirements
            existing.url = _safe_str(j.get("url")) or existing.url
            existing.apply_url = _safe_str(j.get("apply_url")) or existing.apply_url
            existing.logo_url = _safe_str(j.get("logo_url")) or existing.logo_url
            existing.tags = json.dumps(j.get("tags", []))
            if j.get("posted_at"):
                existing.posted_at = j.get("posted_at")
            if j.get("expires_at"):
                existing.expires_at = j.get("expires_at")
            existing.is_active = True
            existing.fetched_at = now
            saved.append(existing)
            continue
        job = Job(
            external_id=_safe_str(j["external_id"]),
            source=_safe_str(j.get("source")),
            title=_safe_str(j.get("title")),
            company=_safe_str(j.get("company")),
            location=_safe_str(j.get("location")),
            is_remote=j.get("is_remote", False),
            job_type=_safe_str(j.get("job_type")),
            salary_min=j.get("salary_min"),
            salary_max=j.get("salary_max"),
            description=(
                _safe_str(j.get("description"))
                or _extract_description_from_requirements(_safe_str(j.get("requirements")))
            ),
            requirements=_safe_str(j.get("requirements")),
            url=_safe_str(j.get("url")),
            apply_url=_safe_str(j.get("apply_url")),
            logo_url=_safe_str(j.get("logo_url")),
            tags=json.dumps(j.get("tags", [])),
            posted_at=j.get("posted_at"),
            expires_at=j.get("expires_at"),
            fetched_at=now,
            is_active=True,
        )
        db.add(job)
        saved.append(job)
    db.commit()
    # Refresh new objects so their IDs are populated
    for job in saved:
        try:
            db.refresh(job)
        except Exception:
            pass
    return saved


def _insert_jobs_skip_existing(db: Session, raw_jobs: list) -> dict:
    """
    Insert-only mode used by manual LinkedIn sync.
    Existing external_id records are skipped (no update).
    """
    now = datetime.now(timezone.utc)
    inserted = 0
    skipped_existing = 0
    skipped_invalid = 0
    seen_batch = set()

    for j in raw_jobs:
        ext = _safe_str(j.get("external_id"))
        if not ext:
            skipped_invalid += 1
            continue
        if ext in seen_batch:
            skipped_existing += 1
            continue
        seen_batch.add(ext)

        exists = db.query(Job.id).filter(Job.external_id == ext).first()
        if exists:
            skipped_existing += 1
            continue

        job = Job(
            external_id=ext,
            source=_safe_str(j.get("source")),
            title=_safe_str(j.get("title")),
            company=_safe_str(j.get("company")),
            location=_safe_str(j.get("location")),
            is_remote=bool(j.get("is_remote", False)),
            job_type=_safe_str(j.get("job_type")),
            salary_min=j.get("salary_min"),
            salary_max=j.get("salary_max"),
            description=_safe_str(j.get("description")),
            requirements=_safe_str(j.get("requirements")),
            url=_safe_str(j.get("url")),
            apply_url=_safe_str(j.get("apply_url")),
            logo_url=_safe_str(j.get("logo_url")),
            tags=json.dumps(j.get("tags", [])),
            posted_at=j.get("posted_at"),
            expires_at=j.get("expires_at"),
            fetched_at=now,
            is_active=True,
        )
        db.add(job)
        inserted += 1

    db.commit()
    return {
        "inserted": inserted,
        "skipped_existing": skipped_existing,
        "skipped_invalid": skipped_invalid,
    }


def _get_default_resume(user_id: int, db: Session) -> Optional[Resume]:
    resume = db.query(Resume).filter(Resume.user_id == user_id, Resume.is_default == True).first()
    if not resume:
        resume = db.query(Resume).filter(Resume.user_id == user_id).first()
    return resume


def _parse_preferences(user: User) -> dict:
    if not user.preferences:
        return {}
    try:
        prefs = json.loads(user.preferences)
        return prefs if isinstance(prefs, dict) else {}
    except Exception:
        return {}


def _target_titles_from_prefs(prefs: dict) -> list[str]:
    raw = prefs.get("job_titles") or []
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    if isinstance(raw, str):
        return [p.strip() for p in raw.split(",") if p.strip()]
    return []


def _pref_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        v = value.strip().lower()
        if v in {"true", "1", "yes"}:
            return True
        if v in {"false", "0", "no"}:
            return False
    return None


def _pref_int(value, default: int) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except Exception:
        return default


def _save_auto_sync_status(user: User, db: Session, payload: dict) -> None:
    prefs = _parse_preferences(user)
    prefs["auto_sync_last_run_at"] = datetime.now(timezone.utc).isoformat()
    prefs["auto_sync_last_fetched"] = int(payload.get("fetched", 0) or 0)
    prefs["auto_sync_last_saved"] = int(payload.get("saved", 0) or 0)
    prefs["auto_sync_last_highest_match"] = payload.get("highest_match_score")
    prefs["auto_sync_last_reason"] = payload.get("reason")
    user.preferences = json.dumps(prefs)
    db.commit()


async def _run_linkedin_auto_sync_for_user(user: User, db: Session) -> dict:
    prefs = _parse_preferences(user)
    auto_sync_enabled = _pref_bool(prefs.get("auto_sync_enabled"))
    if auto_sync_enabled is not True:
        result = {"enabled": False, "fetched": 0, "saved": 0, "reason": "Auto-sync disabled"}
        _save_auto_sync_status(user, db, result)
        return result

    titles = _target_titles_from_prefs(prefs)
    if not titles:
        result = {"enabled": True, "fetched": 0, "saved": 0, "reason": "No target job titles configured"}
        _save_auto_sync_status(user, db, result)
        return result

    resume = _get_default_resume(user.id, db)
    resume_data = _resume_to_dict(resume) if resume else None
    if not resume_data:
        result = {"enabled": True, "fetched": 0, "saved": 0, "reason": "No resume found for match scoring"}
        _save_auto_sync_status(user, db, result)
        return result

    api_keys, api_host, api_path = _resolve_rapidapi_settings(user)
    title_filter = " OR ".join(titles)
    auto_sync_remote = prefs.get("auto_sync_remote")
    auto_sync_external_apply_url = prefs.get("auto_sync_external_apply_url")
    auto_sync_visa = prefs.get("auto_sync_ai_visa_sponsorship_filter")
    daily_budget = _pref_int(prefs.get("auto_sync_daily_budget"), 100)
    max_per_run = _pref_int(prefs.get("auto_sync_max_per_run"), 50)
    date_key = datetime.now(timezone.utc).date().isoformat()
    usage_date = str(prefs.get("auto_sync_usage_date") or "")
    usage_count = _pref_int(prefs.get("auto_sync_usage_count"), 0)
    if usage_date != date_key:
        usage_count = 0
        usage_date = date_key
    remaining_budget = max(0, daily_budget - usage_count)
    configured_limit = _pref_int(prefs.get("auto_sync_limit"), 100)
    effective_limit = max(1, min(configured_limit, max_per_run, remaining_budget if remaining_budget > 0 else 1))
    if remaining_budget <= 0:
        result = {"enabled": True, "fetched": 0, "saved": 0, "reason": "Daily auto-sync budget reached"}
        _save_auto_sync_status(user, db, result)
        return result

    request_params = {
        "limit": effective_limit,
        "offset": _pref_int(prefs.get("auto_sync_offset"), 0),
        "title_filter": title_filter,
        "location_filter": prefs.get("auto_sync_location_filter") or None,
        "description_type": prefs.get("auto_sync_description_type") or "text",
        "type_filter": prefs.get("auto_sync_type_filter") or None,
        "remote": None if auto_sync_remote in (None, "", "any") else _pref_bool(auto_sync_remote),
        "description_filter": prefs.get("auto_sync_description_filter") or None,
        "organization_filter": prefs.get("auto_sync_organization_filter") or None,
        "industry_filter": prefs.get("auto_sync_industry_filter") or None,
        "seniority_filter": prefs.get("auto_sync_seniority_filter") or None,
        "external_apply_url": None if auto_sync_external_apply_url in (None, "", "any") else _pref_bool(auto_sync_external_apply_url),
        "ai_work_arrangement_filter": prefs.get("auto_sync_ai_work_arrangement_filter") or None,
        "ai_experience_level_filter": prefs.get("auto_sync_ai_experience_level_filter") or None,
        "ai_visa_sponsorship_filter": None if auto_sync_visa in (None, "", "any") else _pref_bool(auto_sync_visa),
        "order": prefs.get("auto_sync_order") or None,
    }
    endpoint = str(prefs.get("auto_sync_endpoint") or "").strip()
    if endpoint:
        api_path = endpoint
    raw_jobs = await fetch_linkedin_rapidapi(
        query=title_filter,
        location="",
        remote_only=bool(prefs.get("remote_only", False)) if auto_sync_remote in (None, "", "any") else bool(_pref_bool(auto_sync_remote)),
        force_refresh=True,
        raise_on_error=False,
        request_params=request_params,
        rapidapi_keys=api_keys,
        rapidapi_host=api_host,
        rapidapi_path=api_path,
    )
    if not raw_jobs:
        result = {"enabled": True, "fetched": 0, "saved": 0, "reason": "No LinkedIn jobs returned"}
        _save_auto_sync_status(user, db, result)
        return result

    scored_jobs = []
    for j in raw_jobs:
        score = keyword_score(resume_data, j)
        scored_jobs.append((score, j))
    scored_jobs.sort(key=lambda x: x[0], reverse=True)

    highest_only = prefs.get("auto_sync_highest_match_only", True)
    selected = [scored_jobs[0][1]] if highest_only else [j for _, j in scored_jobs[:20]]
    saved = _upsert_jobs(db, selected)
    result = {
        "enabled": True,
        "fetched": len(raw_jobs),
        "saved": len(saved),
        "highest_match_score": round(scored_jobs[0][0], 1) if scored_jobs else None,
    }
    prefs = _parse_preferences(user)
    prefs["auto_sync_usage_date"] = usage_date
    prefs["auto_sync_usage_count"] = usage_count + len(raw_jobs)
    user.preferences = json.dumps(prefs)
    db.commit()
    _save_auto_sync_status(user, db, result)
    return result


def _should_refresh_linkedin(db: Session) -> bool:
    latest = (
        db.query(Job)
        .filter(Job.source == "linkedin", Job.is_active == True)  # noqa: E712
        .order_by(Job.fetched_at.desc())
        .first()
    )
    if not latest or not latest.fetched_at:
        return True
    try:
        refresh_hours = max(1, int(settings.JOB_REFRESH_INTERVAL_HOURS))
    except Exception:
        refresh_hours = 24
    cutoff = datetime.now(timezone.utc) - timedelta(hours=refresh_hours)
    fetched_at = latest.fetched_at
    if isinstance(fetched_at, str):
        try:
            fetched_at = datetime.fromisoformat(fetched_at.replace("Z", "+00:00"))
        except Exception:
            return True
    if getattr(fetched_at, "tzinfo", None) is None:
        try:
            fetched_at = fetched_at.replace(tzinfo=timezone.utc)
        except Exception:
            return True
    return fetched_at < cutoff


@router.get("/")
async def search_jobs(
    q: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    remote: Optional[str] = Query(None),   # "remote" | "onsite" | None
    job_type: Optional[str] = Query(None), # full-time | part-time | contract | internship
    min_salary: Optional[int] = Query(None),
    max_salary: Optional[int] = Query(None),
    source: Optional[str] = Query(None),   # linkedin | remoteok | arbeitnow | hackernews
    sort: Optional[str] = Query("match"),
    refresh_sources: bool = Query(True),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Daily refresh for LinkedIn (RapidAPI free-tier friendly); other sources fill gaps.
    remote_only = remote == "remote"
    try:
        if refresh_sources and _should_refresh_linkedin(db):
            prefs = _parse_preferences(user)
            if _pref_bool(prefs.get("auto_sync_enabled")) is True:
                # Refresh non-LinkedIn sources; LinkedIn handled by auto-sync policy.
                raw_jobs = await fetch_all_jobs(
                    query=q or "",
                    location=location or "",
                    remote_only=remote_only,
                    include_linkedin=False,
                    rapidapi_key="",  # skip LinkedIn in this pass
                    rapidapi_host="",
                    rapidapi_path="",
                )
                _upsert_jobs(db, raw_jobs)
                await _run_linkedin_auto_sync_for_user(user, db)
            else:
                raw_jobs = await fetch_all_jobs(
                    query=q or "",
                    location=location or "",
                    remote_only=remote_only,
                    include_linkedin=False,
                )
                _upsert_jobs(db, raw_jobs)
    except Exception:
        # Never fail job browsing if a source refresh breaks; serve cached DB jobs.
        pass

    # Query ALL cached jobs from DB (not just current scrape batch)
    db_query = db.query(Job).filter(Job.is_active == True)
    all_jobs = db_query.order_by(Job.fetched_at.desc()).limit(500).all()

    resume = _get_default_resume(user.id, db)
    resume_data = _resume_to_dict(resume) if resume else None

    job_dicts = []
    for job in all_jobs:
        d = _job_to_dict(job)
        if resume_data:
            d["match_score"] = round(keyword_score(resume_data, d), 1)
        job_dicts.append(d)

    # --- Keyword / title search ---
    if q:
        q_lower = q.lower()
        job_dicts = [
            j for j in job_dicts
            if q_lower in (j.get("title") or "").lower()
            or q_lower in (j.get("company") or "").lower()
            or q_lower in (j.get("description") or "").lower()
            or any(q_lower in (t or "").lower() for t in (j.get("tags") or []))
        ]

    # --- Work type filter ---
    if remote == "remote":
        job_dicts = [j for j in job_dicts if j.get("is_remote")]
    elif remote == "onsite":
        job_dicts = [j for j in job_dicts if not j.get("is_remote")]

    # --- Location filter (only for onsite; remote jobs always pass) ---
    if location:
        loc_lower = location.lower()
        job_dicts = [
            j for j in job_dicts
            if j.get("is_remote")                                        # remote jobs always match
            or loc_lower in (j.get("location") or "").lower()
        ]

    # --- Job type filter (skip jobs with no type data — don't exclude them) ---
    if job_type:
        jt_lower = job_type.lower()
        job_dicts = [
            j for j in job_dicts
            if not (j.get("job_type") or "")                             # include jobs with no type info
            or jt_lower in (j.get("job_type") or "").lower()
        ]

    # --- Salary filter (include jobs with NO salary data — we can't know they don't qualify) ---
    if min_salary is not None:
        job_dicts = [
            j for j in job_dicts
            if j.get("salary_min") is None and j.get("salary_max") is None  # no data → include
            or (j.get("salary_max") or 0) >= min_salary
            or (j.get("salary_min") or 0) >= min_salary
        ]

    if max_salary is not None:
        job_dicts = [
            j for j in job_dicts
            if j.get("salary_min") is None and j.get("salary_max") is None  # no data → include
            or (j.get("salary_min") or 0) <= max_salary
        ]

    # --- Source filter ---
    if source:
        job_dicts = [j for j in job_dicts if (j.get("source") or "") == source]

    # --- Sorting ---
    if sort == "match" and resume_data:
        # Prioritize LinkedIn jobs, then match score.
        job_dicts.sort(
            key=lambda j: (
                1 if (j.get("source") or "").lower() == "linkedin" else 0,
                j.get("match_score") or 0,
                j.get("posted_at") or "",
            ),
            reverse=True,
        )
    elif sort == "date":
        job_dicts.sort(
            key=lambda j: (
                1 if (j.get("source") or "").lower() == "linkedin" else 0,
                j.get("posted_at") or "",
            ),
            reverse=True,
        )
    elif sort == "salary":
        job_dicts.sort(
            key=lambda j: (
                1 if (j.get("source") or "").lower() == "linkedin" else 0,
                j.get("salary_max") or j.get("salary_min") or 0,
            ),
            reverse=True,
        )

    start = (page - 1) * per_page
    return {
        "jobs": job_dicts[start: start + per_page],
        "total": len(job_dicts),
        "page": page,
        "per_page": per_page,
        "has_next": (start + per_page) < len(job_dicts),
    }


@router.get("/swipe")
async def swipe_queue(
    limit: int = Query(15, ge=1, le=30),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return curated swipe queue. Respects auto_apply preference."""
    from app.models.application import Application

    acted_ids = {
        row[0] for row in db.query(Application.job_id).filter(Application.user_id == user.id).all()
    }

    # Refresh from sources once/day or when DB is sparse
    db_count = db.query(Job).filter(Job.is_active == True).count()
    try:
        if db_count < 20 or _should_refresh_linkedin(db):
            prefs = _parse_preferences(user)
            if _pref_bool(prefs.get("auto_sync_enabled")) is True:
                raw_jobs = await fetch_all_jobs(
                    include_linkedin=False,
                    rapidapi_key="",  # skip LinkedIn here; handled by auto-sync policy below
                    rapidapi_host="",
                    rapidapi_path="",
                )
                _upsert_jobs(db, raw_jobs)
                await _run_linkedin_auto_sync_for_user(user, db)
            else:
                raw_jobs = await fetch_all_jobs(
                    include_linkedin=False,
                )
                _upsert_jobs(db, raw_jobs)
    except Exception:
        pass

    jobs = db.query(Job).filter(Job.is_active == True).order_by(Job.fetched_at.desc()).limit(300).all()
    resume = _get_default_resume(user.id, db)
    resume_data = _resume_to_dict(resume) if resume else None

    # Load preferences for auto-apply
    prefs = {}
    if user.preferences:
        try:
            prefs = json.loads(user.preferences)
        except Exception:
            pass
    auto_apply_enabled = prefs.get("auto_apply_enabled", False)
    auto_apply_min_score = float(prefs.get("auto_apply_min_score", 75))

    results = []
    auto_applied = []

    for job in jobs:
        if job.id in acted_ids:
            continue
        d = _job_to_dict(job)
        if resume_data:
            d["match_score"] = round(keyword_score(resume_data, d), 1)

        # Auto-apply logic
        if auto_apply_enabled and resume_data and d.get("match_score", 0) >= auto_apply_min_score:
            app = Application(
                user_id=user.id,
                job_id=job.id,
                status="applied",
                is_auto_applied=True,
                match_score=d["match_score"],
            )
            db.add(app)
            acted_ids.add(job.id)
            auto_applied.append(d)
            continue

        results.append(d)
        if len(results) >= limit:
            break

    if auto_applied:
        db.commit()

    if resume_data:
        results.sort(
            key=lambda j: (
                1 if (j.get("source") or "").lower() == "linkedin" else 0,
                j.get("match_score", 0),
                j.get("posted_at") or "",
            ),
            reverse=True,
        )
    else:
        results.sort(
            key=lambda j: (
                1 if (j.get("source") or "").lower() == "linkedin" else 0,
                j.get("posted_at") or "",
            ),
            reverse=True,
        )

    return {
        "jobs": results[:limit],
        "auto_applied_count": len(auto_applied),
    }


@router.post("/sync/linkedin")
async def sync_linkedin_jobs(
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0),
    title_filter: Optional[str] = Query(None),
    location_filter: Optional[str] = Query(None),
    description_filter: Optional[str] = Query(None),
    organization_filter: Optional[str] = Query(None),
    organization_slug_filter: Optional[str] = Query(None),
    description_type: Optional[str] = Query("text"),
    type_filter: Optional[str] = Query(None),
    remote: Optional[bool] = Query(None),
    agency: Optional[bool] = Query(None),
    industry_filter: Optional[str] = Query(None),
    seniority_filter: Optional[str] = Query(None),
    date_filter: Optional[str] = Query(None),
    directapply: Optional[bool] = Query(None),
    external_apply_url: Optional[bool] = Query(None),
    ai_work_arrangement_filter: Optional[str] = Query(None),
    ai_experience_level_filter: Optional[str] = Query(None),
    ai_visa_sponsorship_filter: Optional[bool] = Query(None),
    order: Optional[str] = Query(None),
    advanced_title_filter: Optional[str] = Query(None),
    advanced_organization_filter: Optional[str] = Query(None),
    include_ai: Optional[bool] = Query(None),
    endpoint: Optional[str] = Query(None, description="Override API path, e.g. /active-jb-7d"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manual LinkedIn sync: fetch from RapidAPI and save to local DB."""
    if description_type and description_type not in {"text", "html"}:
        raise HTTPException(status_code=400, detail="description_type must be 'text' or 'html'")
    if order and order not in {"asc", "desc"}:
        raise HTTPException(status_code=400, detail="order must be 'asc' or 'desc'")

    request_params = {
        "limit": limit,
        "offset": offset,
        "title_filter": title_filter,
        "location_filter": location_filter,
        "description_filter": description_filter,
        "organization_filter": organization_filter,
        "organization_slug_filter": organization_slug_filter,
        "description_type": description_type,
        "type_filter": type_filter,
        "remote": remote,
        "agency": agency,
        "industry_filter": industry_filter,
        "seniority_filter": seniority_filter,
        "date_filter": date_filter,
        "directapply": directapply,
        "external_apply_url": external_apply_url,
        "ai_work_arrangement_filter": ai_work_arrangement_filter,
        "ai_experience_level_filter": ai_experience_level_filter,
        "ai_visa_sponsorship_filter": ai_visa_sponsorship_filter,
        "order": order,
        "advanced_title_filter": advanced_title_filter,
        "advanced_organization_filter": advanced_organization_filter,
        "include_ai": include_ai,
    }

    try:
        api_keys, api_host, api_path = _resolve_rapidapi_settings(user)
        if endpoint and endpoint.strip():
            api_path = endpoint.strip()
        raw_jobs = await fetch_linkedin_rapidapi(
            query=title_filter or "",
            location=location_filter or "",
            remote_only=bool(remote),
            force_refresh=True,
            raise_on_error=True,
            request_params=request_params,
            rapidapi_keys=api_keys,
            rapidapi_host=api_host,
            rapidapi_path=api_path,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not raw_jobs:
        return {"message": "No LinkedIn jobs returned from RapidAPI", "fetched": 0, "saved": 0}

    before = db.query(Job).filter(Job.source == "linkedin").count()
    result = _insert_jobs_skip_existing(db, raw_jobs)
    after = db.query(Job).filter(Job.source == "linkedin").count()
    return {
        "message": "LinkedIn sync completed",
        "fetched": len(raw_jobs),
        "saved": result["inserted"],
        "linkedin_total": after,
        "new_records": max(0, after - before),
        "skipped_existing": result["skipped_existing"],
        "skipped_invalid": result["skipped_invalid"],
    }


@router.delete("/sync/linkedin/reset")
def reset_linkedin_jobs(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Remove LinkedIn jobs that are not referenced by tracked/applied records.
    Keeps user application history intact.
    """
    from app.models.application import Application

    tracked_job_ids = {
        row[0] for row in db.query(Application.job_id).filter(Application.job_id.isnot(None)).all()
    }
    linkedin_job_ids = [row[0] for row in db.query(Job.id).filter(Job.source == "linkedin").all()]
    deletable_ids = [jid for jid in linkedin_job_ids if jid not in tracked_job_ids]

    if not linkedin_job_ids:
        return {"message": "No LinkedIn jobs to remove", "deleted_jobs": 0, "kept_tracked_jobs": 0}
    if not deletable_ids:
        return {"message": "All LinkedIn jobs are tracked/applied and were kept", "deleted_jobs": 0, "kept_tracked_jobs": len(linkedin_job_ids)}

    deleted_jobs = db.query(Job).filter(Job.id.in_(deletable_ids)).delete(synchronize_session=False)
    db.commit()
    return {
        "message": "LinkedIn jobs reset completed",
        "deleted_jobs": int(deleted_jobs or 0),
        "kept_tracked_jobs": int(len(linkedin_job_ids) - (deleted_jobs or 0)),
    }


@router.delete("/linkedin/{job_id}")
def delete_linkedin_job(
    job_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Delete one LinkedIn-sourced job from DB.
    Keep protection for tracked/applied jobs to preserve history.
    """
    from app.models.application import Application

    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if (job.source or "").lower() != "linkedin":
        raise HTTPException(status_code=400, detail="Only LinkedIn jobs can be deleted from this action")

    linked_app = db.query(Application.id).filter(Application.job_id == job_id).first()
    if linked_app:
        raise HTTPException(status_code=409, detail="This job is tracked/applied and cannot be deleted")

    db.delete(job)
    db.commit()
    return {"message": "LinkedIn job deleted", "job_id": job_id}


@router.delete("/reset")
def reset_jobs_database(
    source: Optional[str] = Query(None, description="Filter by source, e.g. linkedin"),
    location_filter: Optional[str] = Query(None, description="Substring match for location"),
    remote: Optional[bool] = Query(None, description="true=remote only, false=onsite only"),
    external_apply_url: Optional[bool] = Query(None, description="For LinkedIn payloads, require external apply URL"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Reset jobs listings while keeping tracked/applied jobs (application history).
    Deletes only jobs not referenced by any application.
    """
    from app.models.application import Application

    tracked_job_ids = {
        row[0] for row in db.query(Application.job_id).filter(Application.job_id.isnot(None)).all()
    }
    all_jobs = db.query(Job).all()
    if not all_jobs:
        return {"message": "No jobs to reset", "deleted_jobs": 0, "kept_tracked_jobs": 0}

    src = (source or "").strip().lower()
    loc = (location_filter or "").strip().lower()

    def matches_filters(job: Job) -> bool:
        if src and (job.source or "").lower() != src:
            return False
        if loc and loc not in (job.location or "").lower():
            return False
        if remote is not None and bool(job.is_remote) != bool(remote):
            return False
        if external_apply_url is not None:
            req = {}
            try:
                req = json.loads(job.requirements) if isinstance(job.requirements, str) and job.requirements else {}
            except Exception:
                req = {}
            has_external = bool(str(req.get("external_apply_url") or "").strip())
            if has_external != bool(external_apply_url):
                return False
        return True

    candidate_ids = [job.id for job in all_jobs if matches_filters(job)]
    deletable_ids = [jid for jid in candidate_ids if jid not in tracked_job_ids]
    if not deletable_ids:
        return {"message": "No jobs matched the reset filters or all matched jobs are tracked/applied", "deleted_jobs": 0, "kept_tracked_jobs": len(tracked_job_ids)}

    deleted_jobs = db.query(Job).filter(Job.id.in_(deletable_ids)).delete(synchronize_session=False)
    db.commit()
    return {
        "message": "Jobs database reset completed",
        "deleted_jobs": int(deleted_jobs or 0),
        "kept_tracked_jobs": int(len(tracked_job_ids)),
    }


@router.get("/{job_id}")
def get_job(job_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    resume = _get_default_resume(user.id, db)
    score = keyword_score(_resume_to_dict(resume), _job_to_dict(job)) if resume else None
    return _job_to_dict(job, match_score=score)


@router.post("/{job_id}/match")
async def compute_match(
    job_id: int,
    resume_id: Optional[int] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if resume_id:
        resume = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == user.id).first()
    else:
        resume = _get_default_resume(user.id, db)

    if not resume:
        raise HTTPException(status_code=404, detail="No resume found")

    resume_data = _resume_to_dict(resume)
    job_dict = _job_to_dict(job)

    api_keys = {}
    if user.api_keys_encrypted:
        try:
            api_keys = decrypt_data(user.api_keys_encrypted)
        except Exception:
            pass

    from app.services.ai_service import pick_provider, PROVIDER_PRIORITY
    ai_keys = {k: v for k, v in api_keys.items() if k in PROVIDER_PRIORITY}

    if ai_keys:
        from app.services.job_matcher import ai_match_score
        try:
            provider, api_key = pick_provider(ai_keys)
            score = await ai_match_score(resume_data, job_dict, api_key, provider)
        except Exception:
            score = keyword_score(resume_data, job_dict)
    else:
        score = keyword_score(resume_data, job_dict)

    return {"job_id": job_id, "match_score": round(score, 1)}
