"""
AI-NUSS 3.0 — Global Configuration & Model Routing Matrix
Hardcoded DeepSeek API integration.
"""
import os
from typing import Optional
from dataclasses import dataclass, field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Environment-driven settings with hardcoded defaults."""

    # === Application ===
    APP_NAME: str = "AI-NUSS 3.0"
    APP_VERSION: str = "3.0.0"
    DEBUG: bool = True

    # === Database (PostgreSQL — Single Source of Truth) ===
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql+asyncpg://nuss_admin:SecretPGPassword2026@localhost:5432/ai_nuss_prod",
    )
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10

    # === Redis (Distributed State Locks & Pub/Sub) ===
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))
    REDIS_DB: int = 0

    # === Qdrant (Semantic Recall — auxiliary) ===
    QDRANT_URL: str = os.getenv("QDRANT_URL", "http://localhost:6333")
    QDRANT_COLLECTION_NAME: str = "ai_nuss_characters"

    # === LLM Configuration — provided by user at runtime via model_config ===
    # No hardcoded API keys, base URLs, or model names.
    # All LLM settings are injected through AINUSSState.model_config at job creation.

    # === Stub Mode — OFF means real API calls ===
    STUB_MODE: bool = os.getenv("STUB_MODE", "false").lower() == "true"

    MOCK_DATA_DIR: str = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "evaluation",
        "gold_standard",
    )

    # === Weight Matrix for Scene Scoring (per spec Chapter 15 §2) ===
    SCENE_SCORE_WEIGHT_L: float = 0.40
    SCENE_SCORE_WEIGHT_T: float = 0.30
    SCENE_SCORE_WEIGHT_N: float = 0.15
    SCENE_SCORE_WEIGHT_O: float = 0.10
    SCENE_SCORE_WEIGHT_C: float = 0.05

    # === Confidence Thresholds ===
    CHARACTER_CONFIDENCE_THRESHOLD: float = 0.75
    SCENE_SCORE_THRESHOLD: float = 0.60

    # === WebSocket ===
    WS_MAX_RECONNECT_RETRIES: int = 5
    WS_RECONNECT_BASE_DELAY: float = 1.0

    # === CORS ===
    CORS_ORIGINS: list[str] = field(default_factory=lambda: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ])

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "allow"


# Singleton
settings = Settings()


@dataclass
class GenreWeights:
    """Genre-specific multi-dimensional weight matrix (per spec Chapter 2)."""
    L: float = 0.40
    T: float = 0.30
    N: float = 0.15
    O: float = 0.10
    C: float = 0.05


# Default weight profile
DEFAULT_WEIGHTS = GenreWeights(
    L=settings.SCENE_SCORE_WEIGHT_L,
    T=settings.SCENE_SCORE_WEIGHT_T,
    N=settings.SCENE_SCORE_WEIGHT_N,
    O=settings.SCENE_SCORE_WEIGHT_O,
    C=settings.SCENE_SCORE_WEIGHT_C,
)
