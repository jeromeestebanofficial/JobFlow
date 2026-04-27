import base64
import hashlib
import json
from datetime import datetime, timedelta
from typing import Optional

import bcrypt
from cryptography.fernet import Fernet
from jose import JWTError, jwt

from app.config import settings


def _prepare(password: str) -> bytes:
    # SHA-256 digest → base64 keeps it under bcrypt's 72-byte limit
    return base64.b64encode(hashlib.sha256(password.encode()).digest())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(_prepare(plain), hashed.encode())


def create_access_token(subject: str, expires_delta: Optional[timedelta] = None) -> str:
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    return jwt.encode({"sub": subject, "exp": expire, "type": "access"}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str) -> str:
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": subject, "exp": expire, "type": "refresh"}, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


def _get_fernet() -> Fernet:
    key = settings.ENCRYPTION_KEY
    if not key:
        # Derive a stable key from SECRET_KEY so data survives restarts
        raw = settings.SECRET_KEY.encode()[:32].ljust(32, b"0")
        key = base64.urlsafe_b64encode(raw)
    elif isinstance(key, str):
        key = key.encode()
    return Fernet(key)


def encrypt_data(data: dict) -> str:
    f = _get_fernet()
    return f.encrypt(json.dumps(data).encode()).decode()


def decrypt_data(token: str) -> dict:
    try:
        f = _get_fernet()
        return json.loads(f.decrypt(token.encode()).decode())
    except Exception:
        # Fallback: try the SECRET_KEY-derived key (used before ENCRYPTION_KEY was set)
        raw = settings.SECRET_KEY.encode()[:32].ljust(32, b"0")
        fallback_key = base64.urlsafe_b64encode(raw)
        f2 = Fernet(fallback_key)
        return json.loads(f2.decrypt(token.encode()).decode())
