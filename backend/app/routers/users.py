import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.schemas.user import UserOut, ApiKeyUpdate, PreferencesUpdate
from app.routers.deps import get_current_user
from app.utils.security import encrypt_data, decrypt_data

router = APIRouter(prefix="/users", tags=["users"])


def _to_bool_or_none(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        v = value.strip().lower()
        if v in {"true", "1", "yes"}:
            return True
        if v in {"false", "0", "no"}:
            return False
    return None


def _normalize_preferences_types(prefs: dict) -> tuple[dict, bool]:
    if not isinstance(prefs, dict):
        return {}, True
    normalized = dict(prefs)
    changed = False

    bool_fields = [
        "remote_only",
        "auto_apply_enabled",
        "auto_sync_enabled",
        "auto_sync_highest_match_only",
    ]
    for field in bool_fields:
        if field in normalized:
            coerced = _to_bool_or_none(normalized.get(field))
            if coerced is not None and coerced is not normalized.get(field):
                normalized[field] = coerced
                changed = True

    int_fields = ["auto_apply_min_score", "auto_sync_limit", "auto_sync_offset", "auto_sync_daily_budget", "auto_sync_max_per_run"]
    for field in int_fields:
        if field in normalized and isinstance(normalized.get(field), str):
            raw = normalized.get(field, "").strip()
            if raw.isdigit():
                normalized[field] = int(raw)
                changed = True

    return normalized, changed


@router.get("/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user


@router.get("/me/preferences")
def get_preferences(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user.preferences:
        try:
            parsed = json.loads(user.preferences)
        except Exception:
            parsed = {}
        normalized, changed = _normalize_preferences_types(parsed)
        if changed:
            user.preferences = json.dumps(normalized)
            db.commit()
        return normalized
    return {}


@router.put("/me/preferences")
def update_preferences(data: PreferencesUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = {}
    if user.preferences:
        try:
            existing = json.loads(user.preferences)
        except Exception:
            pass
    updated = {**existing, **data.model_dump(exclude_none=True)}
    updated, _ = _normalize_preferences_types(updated)
    user.preferences = json.dumps(updated)
    db.commit()
    return updated


@router.post("/me/api-keys")
def save_api_key(data: ApiKeyUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = {}
    if user.api_keys_encrypted:
        try:
            existing = decrypt_data(user.api_keys_encrypted)
        except Exception:
            pass
    if data.provider == "rapidapi_key":
        # Supports multiple keys via comma/newline separated input.
        incoming = [
            k.strip()
            for k in str(data.api_key).replace("\n", ",").split(",")
            if k.strip()
        ]
        prev = existing.get("rapidapi_keys") or []
        if not isinstance(prev, list):
            prev = [str(prev)] if str(prev).strip() else []
        merged = []
        for key in prev + incoming:
            if key and key not in merged:
                merged.append(key)
        if not merged:
            raise HTTPException(status_code=400, detail="No valid RapidAPI key provided")
        existing["rapidapi_keys"] = merged
        existing["rapidapi_key"] = merged[0]  # backward compatibility
    else:
        existing[data.provider] = data.api_key
    user.api_keys_encrypted = encrypt_data(existing)
    db.commit()
    return {"message": f"{data.provider} API key saved"}


@router.get("/me/api-keys")
def list_api_keys(user: User = Depends(get_current_user)):
    """Return which providers have keys configured (not the keys themselves).
    Non-secret config values (rapidapi_host, rapidapi_path) are returned in plaintext."""
    if not user.api_keys_encrypted:
        return {"providers": [], "has_encrypted_data": False, "config": {}}
    try:
        keys = decrypt_data(user.api_keys_encrypted)
        from app.services.ai_service import PROVIDER_PRIORITY
        ai_providers = [k for k in keys.keys() if k in PROVIDER_PRIORITY]
        rapid_keys = keys.get("rapidapi_keys") or []
        if not isinstance(rapid_keys, list):
            rapid_keys = []
        if not rapid_keys:
            legacy = str(keys.get("rapidapi_key") or "").strip()
            if legacy:
                rapid_keys = [legacy]

        def _mask_last4(v: str) -> str:
            s = str(v or "").strip()
            if not s:
                return ""
            tail = s[-4:] if len(s) >= 4 else s
            return f"****{tail}"

        config = {
            "rapidapi_host": keys.get("rapidapi_host", ""),
            "rapidapi_path": keys.get("rapidapi_path", ""),
            "rapidapi_keys_masked": [_mask_last4(k) for k in rapid_keys if str(k).strip()],
        }
        return {"providers": ai_providers, "has_encrypted_data": True, "all_keys": list(keys.keys()), "config": config}
    except Exception as e:
        return {"providers": [], "has_encrypted_data": True, "decrypt_error": str(e), "config": {}}


@router.delete("/me/api-keys/{provider}")
def delete_api_key(provider: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.api_keys_encrypted:
        raise HTTPException(status_code=404, detail="No keys stored")
    try:
        keys = decrypt_data(user.api_keys_encrypted)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to decrypt keys")
    keys.pop(provider, None)
    if provider == "rapidapi_key":
        keys.pop("rapidapi_keys", None)
    user.api_keys_encrypted = encrypt_data(keys) if keys else None
    db.commit()
    return {"message": f"{provider} key removed"}
