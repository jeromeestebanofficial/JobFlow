import hashlib
import json
import re
from pathlib import Path
from typing import Optional

from app.services.ai_service import call_ai
from app.utils.cache import cache_get, cache_set


TAILOR_SYSTEM = """You are a senior resume strategist and ATS optimization expert with 15+ years of experience helping candidates land roles at top companies.

Your job is to tailor a candidate's resume for a specific role by improving language quality and surfacing relevant experience — without ever inventing, adding, or fabricating anything.

Core constraint: You operate strictly within the boundaries of what the candidate already has. You transform how their real experience is expressed; you do not add experience they don't have.

Return ONLY valid JSON — no markdown fences, no extra text."""

RULES_PATH = Path(__file__).resolve().parent.parent / "prompts" / "tailor_resume_rules.md"


def _load_tailor_rules() -> str:
    try:
        return RULES_PATH.read_text(encoding="utf-8").strip()
    except Exception:
        return ""

TAILOR_PROMPT = """## Target Role
Job Title: {job_title}

## Job Description
{job_description}

## Candidate's Current Resume (source of truth)
{resume_json}

## Your Task
Tailor this resume for the role above. Return a JSON object updating ONLY these three fields:

1. **summary** — A sharp 2–4 sentence professional summary written specifically for this role.
   - Open with the candidate's title and experience level (from resume).
   - Highlight 2–3 strengths from the resume most relevant to this JD.
   - Close with the value they bring to this specific role.
   - Use zero filler phrases ("results-driven", "passionate", "dynamic", etc.).
   - Do NOT mention any skill or technology not in the original resume.

2. **experience** — Same array structure and length as the original. For each role:
   - Rewrite bullets to start with strong past-tense action verbs.
   - Integrate JD keywords naturally into existing content — rephrase, don't fabricate.
   - If a bullet has a metric, keep it and sharpen the verb.
   - Never invent numbers, team sizes, or percentages not in the original.
   - Never delete a bullet — reorder so most JD-relevant bullets come first within each role.
   - Never change company names, job titles, or dates.

3. **skills** — The original skills array, reordered only.
   - Move skills that appear in the JD to the front.
   - DO NOT add any skill, language, framework, or tool not already in the original list.
   - DO NOT remove any skill from the original list.

Return ONLY raw JSON with these three keys. No explanation, no markdown."""


async def tailor_resume(
    resume_data: dict,
    job_title: str,
    job_description: str,
    api_key: str,
    provider: str = "openai",
    model: Optional[str] = None,
) -> dict:
    key = "tailor:" + hashlib.sha256(
        f"{json.dumps(resume_data, sort_keys=True)}{job_title}{job_description[:500]}".encode()
    ).hexdigest()

    cached = cache_get(key)
    if cached is not None:
        return cached

    prompt = TAILOR_PROMPT.format(
        job_title=job_title,
        job_description=job_description[:5000],
        resume_json=json.dumps(resume_data, indent=2),  # no truncation — full resume
    )
    rules_text = _load_tailor_rules()
    system_prompt = TAILOR_SYSTEM
    if rules_text:
        system_prompt = f"{TAILOR_SYSTEM}\n\n---\n\nTailoring rules to follow strictly:\n\n{rules_text}"
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": prompt},
    ]

    raw = await call_ai(messages, api_key, provider, model, max_tokens=4000, temperature=0.3)

    try:
        tailored = json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", raw, re.DOTALL)
        tailored = json.loads(match.group()) if match else {}

    # Safety guard: strip any skills the AI hallucinated that aren't in the original
    original_skills = set(s.lower() for s in (resume_data.get("skills") or []))
    if "skills" in tailored and isinstance(tailored["skills"], list):
        tailored["skills"] = [
            s for s in tailored["skills"]
            if s.lower() in original_skills
        ]
        # Re-append any original skills the AI silently dropped
        seen = {s.lower() for s in tailored["skills"]}
        for orig in (resume_data.get("skills") or []):
            if orig.lower() not in seen:
                tailored["skills"].append(orig)

    # Merge: original fields are the base; only allow summary, experience, skills to be overwritten
    merged = dict(resume_data)
    for field in ("summary", "experience", "skills"):
        if field in tailored and tailored[field]:
            merged[field] = tailored[field]

    cache_set(key, merged, ttl=86400)
    return merged


async def generate_cover_letter(
    resume_data: dict,
    job_title: str,
    company: str,
    job_description: str,
    api_key: str,
    provider: str = "openai",
    model: Optional[str] = None,
) -> str:
    key = "cover:" + hashlib.sha256(
        f"{resume_data.get('full_name')}{job_title}{company}{job_description[:300]}".encode()
    ).hexdigest()

    cached = cache_get(key)
    if cached is not None:
        return cached

    experience_summary = ""
    for exp in (resume_data.get("experience") or [])[:3]:
        title = exp.get("title") or exp.get("role") or ""
        comp = exp.get("company") or ""
        bullets = exp.get("bullets") or exp.get("responsibilities") or []
        top_bullet = bullets[0] if bullets else ""
        if title or comp:
            experience_summary += f"- {title} at {comp}: {top_bullet}\n"

    messages = [
        {
            "role": "system",
            "content": (
                "You are a professional cover letter writer who crafts targeted, authentic letters. "
                "You only reference skills and experience from the candidate's actual background — never invent. "
                "Write in a confident but natural voice. No filler phrases. No 'I am passionate about'."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Write a cover letter for {resume_data.get('full_name', 'the candidate')} "
                f"applying to {job_title} at {company}.\n\n"
                f"Candidate background:\n"
                f"- Skills: {', '.join((resume_data.get('skills') or [])[:20])}\n"
                f"- Recent experience:\n{experience_summary}"
                f"- Education: {json.dumps((resume_data.get('education') or [])[:1])}\n\n"
                f"Job description (key parts):\n{job_description[:2500]}\n\n"
                "Format: 3 paragraphs.\n"
                "Para 1: Why this specific role at this company — connect their needs to the candidate's relevant background.\n"
                "Para 2: 2–3 concrete examples from the candidate's actual experience that directly address JD requirements.\n"
                "Para 3: Confident close, one sentence on cultural fit or long-term interest, call to action.\n\n"
                "Constraints: under 280 words. No bullet points. No invented skills or experience. "
                "Do not use: 'I am excited to', 'I am passionate about', 'results-driven', 'team player', 'dynamic'."
            ),
        },
    ]
    result = await call_ai(messages, api_key, provider, model, max_tokens=700, temperature=0.4, cache_ttl=86400)
    cache_set(key, result, ttl=86400)
    return result
