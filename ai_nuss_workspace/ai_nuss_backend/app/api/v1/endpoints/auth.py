"""
AI-NUSS 3.0 — Authentication Endpoints
POST /api/v1/auth/login — Authenticate and receive JWT token.
GET  /api/v1/auth/me    — Verify token and return current user.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.schemas.auth import LoginRequest, LoginResponse, ErrorResponse
from app.core.auth import (
    verify_password,
    create_access_token,
    get_username_from_token,
    JWT_EXPIRE_HOURS,
)

router = APIRouter(tags=["Auth"])
security = HTTPBearer(auto_error=False)


# ═══════════════════════════════════════════════════════════
# POST /login — Authenticate and issue JWT
# ═══════════════════════════════════════════════════════════

@router.post(
    "/login",
    response_model=LoginResponse,
    responses={401: {"model": ErrorResponse, "description": "Invalid credentials"}},
    summary="用户登录",
    description="使用用户名和密码登录，获取 JWT 访问令牌。",
)
async def login(body: LoginRequest):
    """
    Authenticate user with username/password and return a JWT access token.

    Default credentials (override via env vars ADMIN_USERNAME / ADMIN_PASSWORD):
      - Username: admin
      - Password: admin123
    """
    if not verify_password(body.username, body.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(body.username)
    return LoginResponse(
        access_token=token,
        token_type="bearer",
        username=body.username,
        expires_in=JWT_EXPIRE_HOURS * 3600,
    )


# ═══════════════════════════════════════════════════════════
# GET /me — Verify token and return current user info
# ═══════════════════════════════════════════════════════════

@router.get(
    "/me",
    responses={401: {"model": ErrorResponse, "description": "Invalid or expired token"}},
    summary="获取当前用户信息",
    description="验证 JWT 令牌并返回当前登录用户的信息。",
)
async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    """
    Verify the Bearer token and return the authenticated user's info.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )
    username = get_username_from_token(credentials.credentials)
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="令牌无效或已过期",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return {
        "username": username,
        "authenticated": True,
    }
