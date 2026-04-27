"""
Job scraper — pulls from free/public sources.
Sources:
  - RemoteOK  (public REST API, no auth)
  - Arbeitnow  (free public job board API)
  - HackerNews "Who is Hiring" via Algolia (public)
"""
import asyncio
import json
import random
import re
from datetime import datetime, timezone
from typing import List, Optional

import httpx

from app.config import settings
from app.utils.cache import cache_get, cache_set

_FALLBACK_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)

try:
    from fake_useragent import UserAgent
    _ua_gen = UserAgent(fallback=_FALLBACK_UA)
    def _random_ua() -> str:
        try:
            return _ua_gen.random
        except Exception:
            return _FALLBACK_UA
except Exception:
    def _random_ua() -> str:
        return _FALLBACK_UA


def _headers() -> dict:
    return {
        "User-Agent": _random_ua(),
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
    }


async def _delay():
    await asyncio.sleep(random.uniform(0.8, 2.5))


async def fetch_remoteok(query: str = "", tags: Optional[List[str]] = None) -> List[dict]:
    key = f"remoteok:{query}:{tags}"
    cached = cache_get(key)
    if cached is not None:
        return cached

    await _delay()
    async with httpx.AsyncClient(timeout=20, headers=_headers()) as client:
        try:
            resp = await client.get("https://remoteok.com/api")
            resp.raise_for_status()
            raw = resp.json()
        except Exception:
            return []

    jobs = []
    for item in raw[1:]:
        if not isinstance(item, dict):
            continue
        title = item.get("position", "")
        if query and query.lower() not in title.lower() and query.lower() not in " ".join(item.get("tags", [])).lower():
            continue
        if tags:
            job_tags = [t.lower() for t in item.get("tags", [])]
            if not any(t.lower() in job_tags for t in tags):
                continue
        jobs.append({
            "external_id": f"remoteok-{item.get('id', '')}",
            "source": "remoteok",
            "title": title,
            "company": item.get("company", ""),
            "location": "Remote",
            "is_remote": True,
            "job_type": "full-time",
            "salary_min": item.get("salary_min"),
            "salary_max": item.get("salary_max"),
            "description": item.get("description", ""),
            "url": item.get("url", ""),
            "apply_url": item.get("apply_url") or item.get("url", ""),
            "logo_url": item.get("company_logo", ""),
            "tags": item.get("tags", []),
            "posted_at": _parse_epoch(item.get("epoch")),
        })

    cache_set(key, jobs, ttl=1800)
    return jobs


async def fetch_arbeitnow(query: str = "", remote: bool = False) -> List[dict]:
    key = f"arbeitnow:{query}:{remote}"
    cached = cache_get(key)
    if cached is not None:
        return cached

    await _delay()
    params: dict = {"page": 1}
    if query:
        params["search"] = query
    if remote:
        params["remote"] = "true"

    async with httpx.AsyncClient(timeout=20, headers=_headers()) as client:
        try:
            resp = await client.get("https://www.arbeitnow.com/api/job-board-api", params=params)
            resp.raise_for_status()
            raw = resp.json().get("data", [])
        except Exception:
            return []

    jobs = []
    for item in raw:
        jobs.append({
            "external_id": f"arbeitnow-{item.get('slug', '')}",
            "source": "arbeitnow",
            "title": item.get("title", ""),
            "company": item.get("company_name", ""),
            "location": item.get("location", "Remote" if item.get("remote") else ""),
            "is_remote": item.get("remote", False),
            "job_type": item.get("job_types", [""])[0] if item.get("job_types") else "",
            "salary_min": None,
            "salary_max": None,
            "description": item.get("description", ""),
            "url": item.get("url", ""),
            "apply_url": item.get("url", ""),
            "logo_url": "",
            "tags": item.get("tags", []),
            "posted_at": _parse_iso(item.get("created_at")),
        })

    cache_set(key, jobs, ttl=1800)
    return jobs


async def fetch_hn_jobs(query: str = "") -> List[dict]:
    key = f"hn:{query}"
    cached = cache_get(key)
    if cached is not None:
        return cached

    await _delay()
    params = {"query": f"who is hiring {query}".strip(), "tags": "job", "hitsPerPage": 30}

    async with httpx.AsyncClient(timeout=20, headers=_headers()) as client:
        try:
            resp = await client.get("https://hn.algolia.com/api/v1/search", params=params)
            resp.raise_for_status()
            hits = resp.json().get("hits", [])
        except Exception:
            return []

    jobs = []
    for item in hits:
        raw_title = item.get("title") or item.get("story_title") or ""
        title = _extract_hn_role(raw_title)
        if not title:
            continue
        jobs.append({
            "external_id": f"hn-{item.get('objectID', '')}",
            "source": "hackernews",
            "title": title,
            "company": _extract_hn_company(raw_title),
            "location": _extract_hn_location(raw_title),
            "is_remote": "remote" in (raw_title + item.get("text", "")).lower(),
            "job_type": "",
            "salary_min": None,
            "salary_max": None,
            "description": _strip_html(item.get("text", "")),
            "url": f"https://news.ycombinator.com/item?id={item.get('objectID', '')}",
            "apply_url": f"https://news.ycombinator.com/item?id={item.get('objectID', '')}",
            "logo_url": "",
            "tags": [],
            "posted_at": _parse_epoch(item.get("created_at_i")),
        })

    cache_set(key, jobs, ttl=3600)
    return jobs


def _norm_location(*parts: str) -> str:
    vals = [str(p).strip() for p in parts if p and str(p).strip()]
    return ", ".join(vals)


def _to_int(v):
    try:
        if v is None or v == "":
            return None
        return int(float(v))
    except Exception:
        return None


def _to_str(v) -> str:
    if v is None:
        return ""
    if isinstance(v, list):
        for x in v:
            sx = str(x).strip()
            if sx:
                return sx
        return ""
    return str(v).strip()


def _to_list(v) -> list:
    if v is None:
        return []
    if isinstance(v, list):
        return [str(x).strip() for x in v if str(x).strip()]
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return []
        if "," in s:
            return [p.strip() for p in s.split(",") if p.strip()]
        return [s]
    return [str(v)]


def _deep_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        parts = []
        for v in value.values():
            t = _deep_text(v)
            if t:
                parts.append(t)
        return " ".join(parts).strip()
    if isinstance(value, list):
        parts = []
        for v in value:
            t = _deep_text(v)
            if t:
                parts.append(t)
        return " ".join(parts).strip()
    return str(value).strip()


def _clean_jd_text(raw: str) -> str:
    if not raw:
        return ""
    text = _strip_html(raw)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _extract_linkedin_description(item: dict) -> str:
    candidates = [
        item.get("description_text"),
        item.get("description"),
        item.get("job_description"),
        item.get("description_html"),
        item.get("descriptionHtml"),
        item.get("descriptionSnippet"),
        item.get("snippet"),
        item.get("summary"),
        item.get("job_summary"),
        item.get("formatted_description"),
        item.get("details"),
        item.get("content"),
    ]

    # Nested payloads that often contain rich JD blocks.
    for nested_key in ("job", "job_posting", "jobPosting", "data", "attributes"):
        nested_val = item.get(nested_key)
        if isinstance(nested_val, (dict, list)):
            candidates.append(_deep_text(nested_val))

    for c in candidates:
        text = _clean_jd_text(_deep_text(c))
        if len(text) >= 40:
            return text
    for c in candidates:
        text = _clean_jd_text(_deep_text(c))
        if text:
            return text
    return ""


def _pick_first(*vals):
    for v in vals:
        if isinstance(v, list):
            for x in v:
                sx = str(x).strip()
                if sx:
                    return sx
        else:
            sx = str(v).strip() if v is not None else ""
            if sx and sx.lower() != "none":
                return sx
    return ""


def _location_from_raw(item: dict) -> str:
    derived = item.get("locations_derived")
    if isinstance(derived, list) and derived:
        v = str(derived[0]).strip()
        if v:
            return v

    countries = item.get("countries_derived")
    if isinstance(countries, list) and countries:
        v = str(countries[0]).strip()
        if v:
            return v

    raw = item.get("locations_raw")
    if isinstance(raw, list) and raw:
        first = raw[0] if isinstance(raw[0], dict) else {}
        addr = first.get("address", {}) if isinstance(first, dict) else {}
        return _norm_location(
            addr.get("addressLocality"),
            addr.get("addressRegion"),
            addr.get("addressCountry"),
        )
    return ""


def _is_linkedin_item_active(item: dict) -> bool:
    """Best-effort active filter to avoid syncing closed/expired LinkedIn jobs."""
    if not isinstance(item, dict):
        return False

    # Explicit inactive/closed flags from provider payload.
    if item.get("is_active") is False:
        return False
    if item.get("active") is False:
        return False
    if item.get("open") is False:
        return False

    status_blob = " ".join(
        str(item.get(k, "")).strip().lower()
        for k in ("status", "state", "job_state", "availability_status", "listing_state")
    )
    if any(s in status_blob for s in ("closed", "inactive", "expired", "removed", "deleted", "archived")):
        return False

    # Explicit textual "closed/unavailable" signals sometimes appear in payload text.
    text_blob = " ".join(
        _to_str(item.get(k, ""))
        for k in (
            "title",
            "job_title",
            "position",
            "description_text",
            "description",
            "job_description",
            "status",
            "state",
            "job_state",
            "availability_status",
        )
    ).lower()
    closed_markers = (
        "unable to load the page",
        "no longer accepting applications",
        "job posting has been removed",
        "job id provided may not be valid",
        "this job is no longer available",
        "position has been filled",
    )
    if any(m in text_blob for m in closed_markers):
        return False

    # If API provides expiry, skip already expired records.
    exp = _parse_iso(
        item.get("date_validthrough")
        or item.get("expires_at")
        or item.get("expiration_date")
        or item.get("expiry_date")
    )
    if exp is not None:
        if getattr(exp, "tzinfo", None) is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            return False

    # Must have a usable job link.
    job_url = _to_str(item.get("job_url") or item.get("url") or item.get("apply_link"))
    if not job_url or not job_url.startswith(("http://", "https://")):
        return False

    return True


def _parse_linkedin_payload(raw) -> List[dict]:
    if isinstance(raw, dict):
        # Explicit key check — don't use `or` with lists ([] is falsy but valid)
        for key in ("data", "jobs", "results", "items", "jobListings", "job_listings"):
            if key in raw and isinstance(raw[key], list):
                candidates = raw[key]
                break
        else:
            candidates = []
    elif isinstance(raw, list):
        candidates = raw
    else:
        candidates = []

    jobs = []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        if not _is_linkedin_item_active(item):
            continue
        title = item.get("title") or item.get("job_title") or item.get("position") or ""
        if not title:
            continue
        job_url = item.get("job_url") or item.get("url") or item.get("apply_link") or ""
        ext = item.get("job_id") or item.get("id") or job_url
        if not ext:
            continue
        external_apply_raw = item.get("external_apply_url")
        direct_apply = bool(item.get("directapply") is True or external_apply_raw in (None, "", "null"))
        company_site_url = _to_str(item.get("linkedin_org_url") or item.get("company_url") or item.get("organization_website"))
        external_apply = _to_str(
            external_apply_raw
            or item.get("application_url")
            or item.get("company_apply_url")
            or item.get("offsite_apply_url")
        )
        # Link policy:
        # - Easy Apply jobs should keep LinkedIn job URL.
        # - Non-Easy Apply jobs should prefer external/company website link.
        apply_url = _to_str(job_url) if direct_apply else (external_apply or company_site_url or _to_str(job_url))
        location = _pick_first(
            _location_from_raw(item),
            item.get("location"),
            item.get("city"),
            item.get("state"),
            item.get("country"),
        )
        remote_flag = str(item.get("remote_derived") or item.get("remote") or item.get("work_type") or "").lower()
        is_remote = (
            bool(item.get("is_remote"))
            or bool(item.get("remote_derived"))
            or "remote" in remote_flag
            or "remote" in location.lower()
        )
        specialities = _to_list(item.get("linkedin_org_specialties"))
        tags = _to_list(item.get("skills") or item.get("tags")) + specialities
        # Preserve full payload for debugging/future enrichment.
        raw_payload = json.dumps(item, ensure_ascii=False)
        jobs.append(
            {
                "external_id": f"linkedin-{ext}",
                "source": "linkedin",
                "title": _to_str(title),
                "company": _to_str(item.get("organization") or item.get("company") or item.get("company_name")),
                "location": location or ("Remote" if is_remote else ""),
                "is_remote": is_remote,
                "job_type": _to_str(item.get("employment_type") or item.get("job_type")),
                "salary_min": _to_int(item.get("salary_min") or item.get("min_salary")),
                "salary_max": _to_int(item.get("salary_max") or item.get("max_salary")),
                "description": _extract_linkedin_description(item),
                "requirements": raw_payload,
                "url": _to_str(job_url),
                "apply_url": apply_url,
                "logo_url": _to_str(item.get("organization_logo") or item.get("company_logo")),
                "tags": list(dict.fromkeys([t for t in tags if t])),
                "posted_at": _parse_iso(item.get("date_posted") or item.get("posted_date") or item.get("date_created")) or _parse_epoch(item.get("posted_at")),
                "expires_at": _parse_iso(item.get("date_validthrough")),
            }
        )
    return jobs


async def fetch_linkedin_rapidapi(
    query: str = "",
    location: str = "",
    remote_only: bool = False,
    force_refresh: bool = False,
    raise_on_error: bool = False,
    request_params: Optional[dict] = None,
    rapidapi_keys: Optional[list[str]] = None,
    rapidapi_key: Optional[str] = None,
    rapidapi_host: Optional[str] = None,
    rapidapi_path: Optional[str] = None,
) -> List[dict]:
    """Fetch LinkedIn jobs via RapidAPI and normalize output."""
    key_pool: list[str] = []
    if rapidapi_keys:
        key_pool.extend([k.strip() for k in rapidapi_keys if str(k).strip()])
    if rapidapi_key and rapidapi_key.strip():
        key_pool.append(rapidapi_key.strip())
    if settings.RAPIDAPI_KEY:
        key_pool.append(settings.RAPIDAPI_KEY.strip())
    # Keep order, remove duplicates.
    seen_keys = set()
    api_keys = []
    for k in key_pool:
        if k and k not in seen_keys:
            seen_keys.add(k)
            api_keys.append(k)
    api_host = rapidapi_host or settings.RAPIDAPI_HOST
    api_path = rapidapi_path or settings.RAPIDAPI_LINKEDIN_PATH

    if not api_keys:
        if raise_on_error:
            raise RuntimeError(
                "RapidAPI key is not configured. "
                "Add your RapidAPI key in Settings → AI & API Keys → RapidAPI Key."
            )
        return []

    cache_key = f"linkedin_rapidapi:{query}:{location}:{remote_only}:{json.dumps(request_params or {}, sort_keys=True)}"
    if not force_refresh:
        cached = cache_get(cache_key)
        if cached is not None:
            return cached

    await _delay()
    # Build params — request_params takes precedence; keyword/location are derived
    # from title_filter/location_filter inside request_params, so don't duplicate.
    params: dict = {}
    if request_params:
        for k, v in request_params.items():
            if v is None:
                continue
            if isinstance(v, str) and not v.strip():
                continue
            if isinstance(v, bool):
                params[k] = "true" if v else "false"
            else:
                params[k] = v
    # Only add keyword/location if they weren't already covered by request_params
    if query and "title_filter" not in params and "keyword" not in params:
        params["title_filter"] = query
    if location and "location_filter" not in params and "location" not in params:
        params["location_filter"] = location
    if remote_only and "remote" not in params:
        params["remote"] = "true"

    url = f"https://{api_host}{api_path}"
    data = None
    last_error: Exception | None = None
    last_status = None
    last_resp = None
    for idx, api_key in enumerate(api_keys):
        headers = {
            "X-RapidAPI-Key": api_key,
            "X-RapidAPI-Host": api_host,
        }
        resp = None
        async with httpx.AsyncClient(timeout=30, headers=headers) as client:
            try:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()
                break
            except Exception as e:
                last_error = e
                last_status = getattr(resp, "status_code", None)
                last_resp = resp
                # If more keys remain, continue fallback.
                if idx < len(api_keys) - 1:
                    continue
    if data is None:
        if raise_on_error and last_error is not None:
            e = last_error
            msg = str(e)
            status_code = last_status
            try:
                body = last_resp.json() if last_resp is not None else {}
                if isinstance(body, dict):
                    msg = body.get("message") or body.get("error") or body.get("detail") or msg
            except Exception:
                pass
            if status_code == 401 or status_code == 403:
                raise RuntimeError(
                    f"RapidAPI authentication failed ({status_code}) across all configured keys. "
                    "Check that at least one RapidAPI key is valid and subscribed."
                ) from e
            if status_code == 429:
                raise RuntimeError(
                    "RapidAPI rate limit exceeded across all configured keys. Wait a moment and try again."
                ) from e
            raise RuntimeError(f"LinkedIn RapidAPI fetch failed ({status_code}): {msg}") from e
        return []

    jobs = _parse_linkedin_payload(data)

    if not jobs and raise_on_error:
        # Surface what the API actually returned so the caller can report it
        top_keys = list(data.keys()) if isinstance(data, dict) else type(data).__name__
        raw_count = len(data) if isinstance(data, list) else (
            sum(len(v) for v in data.values() if isinstance(v, list)) if isinstance(data, dict) else 0
        )
        status_field = data.get("status") or data.get("message") or "" if isinstance(data, dict) else ""
        raise RuntimeError(
            f"RapidAPI returned a response but 0 jobs were parsed. "
            f"Response keys: {top_keys}. "
            f"Raw item count across all list fields: {raw_count}. "
            f"Status field: '{status_field}'. "
            "Check your RapidAPI subscription and that the endpoint path is correct."
        )

    if jobs:
        cache_set(cache_key, jobs, ttl=1800)
    return jobs


async def fetch_all_jobs(
    query: str = "",
    location: str = "",
    remote_only: bool = False,
    tags: Optional[List[str]] = None,
    include_linkedin: bool = True,
    rapidapi_keys: Optional[list[str]] = None,
    rapidapi_key: Optional[str] = None,
    rapidapi_host: Optional[str] = None,
    rapidapi_path: Optional[str] = None,
) -> List[dict]:
    tasks = [
        fetch_remoteok(query, tags),
        fetch_arbeitnow(query, remote_only),
        fetch_hn_jobs(query),
    ]
    if include_linkedin:
        tasks.insert(
            0,
            fetch_linkedin_rapidapi(
                query,
                location,
                remote_only,
                rapidapi_keys=rapidapi_keys,
                rapidapi_key=rapidapi_key,
                rapidapi_host=rapidapi_host,
                rapidapi_path=rapidapi_path,
            ),
        )
    results = await asyncio.gather(*tasks, return_exceptions=True)
    merged, seen = [], set()
    for source_jobs in results:
        if isinstance(source_jobs, Exception):
            continue
        for job in source_jobs:
            eid = job.get("external_id", "")
            if eid not in seen:
                seen.add(eid)
                merged.append(job)
    return merged


def _parse_epoch(v) -> Optional[datetime]:
    try:
        return datetime.utcfromtimestamp(int(v)) if v else None
    except Exception:
        return None


def _parse_iso(v) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(v.replace("Z", "+00:00")) if v else None
    except Exception:
        return None


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text).strip()


def _extract_hn_role(title: str) -> str:
    parts = [p.strip() for p in title.split("|")]
    return parts[1] if len(parts) >= 2 else title


def _extract_hn_company(title: str) -> str:
    return title.split("|")[0].strip() if "|" in title else ""


def _extract_hn_location(title: str) -> str:
    parts = [p.strip() for p in title.split("|")]
    return parts[2] if len(parts) >= 3 else ""
