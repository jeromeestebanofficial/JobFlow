import hashlib
import json
import re
from typing import Optional

from app.services.ai_service import call_ai
from app.utils.cache import cache_get, cache_set

STOPWORDS = {
    "with", "from", "that", "this", "your", "have", "will", "into", "about", "role",
    "team", "work", "years", "year", "experience", "required", "preferred", "using",
    "build", "building", "across", "their", "they", "them", "more", "than", "must",
    "strong", "ability", "skills", "skill", "knowledge", "understanding",
}


def _tokenize(text: str) -> set[str]:
    tokens = set(re.findall(r"\b[a-zA-Z][a-zA-Z0-9+#.-]{2,}\b", (text or "").lower()))
    return {t for t in tokens if t not in STOPWORDS}


def _flatten_resume_text(resume_data: dict) -> str:
    parts: list[str] = [
        resume_data.get("full_name") or "",
        resume_data.get("summary") or "",
        " ".join(resume_data.get("skills") or []),
        " ".join(resume_data.get("certifications") or []),
    ]
    for exp in (resume_data.get("experience") or []):
        if isinstance(exp, dict):
            parts.extend(
                [
                    exp.get("title") or "",
                    exp.get("company") or "",
                    exp.get("location") or "",
                    exp.get("start_date") or "",
                    exp.get("end_date") or "",
                    " ".join(exp.get("bullets") or []),
                ]
            )
    for edu in (resume_data.get("education") or []):
        if isinstance(edu, dict):
            parts.extend(
                [
                    edu.get("degree") or "",
                    edu.get("school") or "",
                    edu.get("honors") or "",
                ]
            )
    for proj in (resume_data.get("projects") or []):
        if isinstance(proj, dict):
            parts.extend(
                [
                    proj.get("name") or "",
                    proj.get("description") or "",
                    " ".join(proj.get("tech") or []),
                ]
            )
    return " ".join(parts)


def _flatten_job_text(job: dict) -> tuple[str, str, list[str]]:
    title = str(job.get("title") or "")
    tags = [str(t) for t in (job.get("tags") or []) if str(t).strip()]
    req = job.get("requirements") or ""
    if isinstance(req, dict):
        req_text = json.dumps(req, ensure_ascii=False)
    else:
        req_text = str(req)
    desc_text = str(job.get("description") or "")
    job_text = " ".join([title, desc_text, req_text, " ".join(tags)])
    return job_text, title, tags


def _phrase_coverage(phrases: list[str], haystack: str) -> float:
    clean = [p.strip().lower() for p in phrases if p and p.strip()]
    if not clean:
        return 0.0
    h = (haystack or "").lower()
    matched = sum(1 for p in clean if p in h)
    return matched / len(clean)


def keyword_score(resume_data: dict, job: dict) -> float:
    """
    0-100 match score with weighted signals:
    - job-token coverage (description/requirements/tags)
    - title-token coverage
    - tag phrase coverage
    - resume skill phrase coverage in job text
    """
    resume_text = _flatten_resume_text(resume_data)
    job_text, job_title, job_tags = _flatten_job_text(job)

    resume_tokens = _tokenize(resume_text)
    job_tokens = _tokenize(job_text)
    title_tokens = _tokenize(job_title)
    if not job_tokens and not title_tokens and not job_tags:
        return 0.0

    # How much of the job language is represented in resume language.
    token_coverage = (len(job_tokens & resume_tokens) / len(job_tokens)) if job_tokens else 0.0
    title_coverage = (len(title_tokens & resume_tokens) / len(title_tokens)) if title_tokens else 0.0
    tag_coverage = _phrase_coverage(job_tags, resume_text)
    skill_coverage = _phrase_coverage(resume_data.get("skills") or [], job_text)

    raw = (
        0.45 * token_coverage
        + 0.25 * title_coverage
        + 0.20 * tag_coverage
        + 0.10 * skill_coverage
    ) * 100.0

    # Keep very weak matches from looking inflated.
    if token_coverage < 0.05 and title_coverage == 0 and tag_coverage == 0:
        raw *= 0.5

    return round(max(0.0, min(100.0, raw)), 1)


async def ai_match_score(
    resume_data: dict,
    job: dict,
    api_key: str,
    provider: str = "openai",
    model: Optional[str] = None,
) -> float:
    key = "match:" + hashlib.sha256(
        f"{json.dumps(resume_data.get('skills'), sort_keys=True)}{job.get('external_id')}".encode()
    ).hexdigest()

    cached = cache_get(key)
    if cached is not None:
        return float(cached)

    messages = [
        {
            "role": "system",
            "content": (
                "You are a technical recruiter. Score how well a candidate's profile matches a job. "
                'Return ONLY a JSON object: {"score": <number 0-100>, "reason": "<one sentence>"}'
            ),
        },
        {
            "role": "user",
            "content": (
                f"Job: {job.get('title')} at {job.get('company')}\n"
                f"Required tags/skills: {', '.join(job.get('tags') or [])}\n"
                f"Job description (excerpt): {(job.get('description') or '')[:1000]}\n\n"
                f"Candidate skills: {', '.join(resume_data.get('skills') or [])}\n"
                f"Candidate summary: {(resume_data.get('summary') or '')[:300]}\n\n"
                "Score the match 0-100."
            ),
        },
    ]

    try:
        raw = await call_ai(messages, api_key, provider, model, max_tokens=150, temperature=0.1)
        result = json.loads(raw)
        score = float(result.get("score", 50))
    except Exception:
        score = keyword_score(resume_data, job)

    cache_set(key, score, ttl=86400)
    return score


def batch_keyword_scores(resume_data: dict, jobs: list) -> list:
    for job in jobs:
        job["match_score"] = keyword_score(resume_data, job)
    return sorted(jobs, key=lambda j: j["match_score"], reverse=True)
