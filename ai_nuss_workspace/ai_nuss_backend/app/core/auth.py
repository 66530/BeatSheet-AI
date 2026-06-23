"""
AI-NUSS 3.0 — JWT Authentication Utilities
Simple password-based login with JWT token issuance and verification.
No hardcoded credentials — all secrets come from environment or are auto-generated on startup.
"""
import os
import hashlib
import secrets
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from dotenv import load_dotenv

# Ensure .env is loaded before reading os.getenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"), override=False)

from app.core.config import settings  # noqa: E402

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════
# JWT Configuration — auto-generate if not provided
# ═══════════════════════════════════════════════════════════

_JWT_SECRET_ENV = os.getenv("JWT_SECRET", "").strip()
if _JWT_SECRET_ENV:
    JWT_SECRET = _JWT_SECRET_ENV
else:
    JWT_SECRET = secrets.token_hex(32)
    logger.warning("JWT_SECRET not set — auto-generated for this session. "
                   "Set it in .env for persistence across restarts.")

JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_HOURS: int = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

# ═══════════════════════════════════════════════════════════
# Admin Credentials — no hardcoded defaults
# ═══════════════════════════════════════════════════════════

ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")

_ADMIN_PASSWORD_ENV = os.getenv("ADMIN_PASSWORD", "").strip()
if _ADMIN_PASSWORD_ENV:
    ADMIN_PASSWORD_HASH = hashlib.sha256(_ADMIN_PASSWORD_ENV.encode()).hexdigest()
else:
    _generated_password = secrets.token_hex(8)
    ADMIN_PASSWORD_HASH = hashlib.sha256(_generated_password.encode()).hexdigest()
    logger.warning(
        "ADMIN_PASSWORD not set in .env — generated temporary password: %s\n"
        "Set ADMIN_PASSWORD in .env for persistence.",
        _generated_password,
    )


def verify_password(username: str, password: str) -> bool:
    """Verify username and password against configured credentials."""
    if username != ADMIN_USERNAME:
        return False
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    return secrets.compare_digest(password_hash, ADMIN_PASSWORD_HASH)


def create_access_token(username: str) -> str:
    """Create a JWT access token for the given username."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": username,
        "iat": now,
        "exp": now + timedelta(hours=JWT_EXPIRE_HOURS),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Optional[dict]:
    """
    Decode and validate a JWT access token.
    Returns the payload dict if valid, None otherwise.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            return None
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


def get_username_from_token(token: str) -> Optional[str]:
    """Extract username from a validated token."""
    payload = decode_access_token(token)
    if payload is None:
        return None
    return payload.get("sub")
