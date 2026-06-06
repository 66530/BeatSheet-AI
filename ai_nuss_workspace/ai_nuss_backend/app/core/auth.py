"""
AI-NUSS 3.0 — JWT Authentication Utilities
Simple password-based login with JWT token issuance and verification.
"""
import os
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from app.core.config import settings

# ═══════════════════════════════════════════════════════════
# JWT Configuration
# ═══════════════════════════════════════════════════════════

JWT_SECRET: str = os.getenv("JWT_SECRET", "ai-nuss-dev-secret-change-in-production")
JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_HOURS: int = int(os.getenv("JWT_EXPIRE_HOURS", "24"))

# ═══════════════════════════════════════════════════════════
# Hardcoded Admin Credentials (override via env vars)
# ═══════════════════════════════════════════════════════════

ADMIN_USERNAME: str = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD_HASH: str = hashlib.sha256(
    os.getenv("ADMIN_PASSWORD", "admin123").encode()
).hexdigest()


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
