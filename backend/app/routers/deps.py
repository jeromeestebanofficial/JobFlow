import json
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.user import User
from app.utils.security import decode_token, decrypt_data

bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    subject = decode_token(credentials.credentials)
    if not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.query(User).filter(User.id == int(subject)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def get_current_admin(user: User = Depends(get_current_user)) -> User:
    allowed = bool(user.is_admin) or (
        user.email and user.email.lower() in settings.admin_emails_set
    )
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def get_user_api_keys(user: User = Depends(get_current_user)) -> dict:
    if not user.api_keys_encrypted:
        return {}
    try:
        return decrypt_data(user.api_keys_encrypted)
    except Exception:
        return {}


def require_api_key(user: User = Depends(get_current_user)) -> tuple[User, dict]:
    keys = {}
    if user.api_keys_encrypted:
        try:
            keys = decrypt_data(user.api_keys_encrypted)
        except Exception:
            pass
    if not keys:
        raise HTTPException(
            status_code=400,
            detail="No AI API key configured. Add one in Settings.",
        )
    return user, keys


def get_preferences(user: User = Depends(get_current_user)) -> dict:
    if user.preferences:
        try:
            return json.loads(user.preferences)
        except Exception:
            pass
    return {}
