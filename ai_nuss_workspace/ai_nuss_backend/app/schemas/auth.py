"""
AI-NUSS 3.0 — Auth Pydantic Schemas
Request/Response models for login and token endpoints.
"""
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    """Login request body."""
    username: str = Field(..., min_length=1, max_length=64, description="用户名")
    password: str = Field(..., min_length=1, max_length=128, description="密码")


class LoginResponse(BaseModel):
    """Successful login response."""
    access_token: str = Field(..., description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    username: str = Field(..., description="Authenticated username")
    expires_in: int = Field(..., description="Token expiry in seconds")


class ErrorResponse(BaseModel):
    """Standard error response."""
    detail: str = Field(..., description="Error message")
