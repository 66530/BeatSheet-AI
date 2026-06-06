"""
AI-NUSS 3.0 — FastAPI Dependencies (Async DB Session + Redis Injection)
Per spec Chapter 3: deps.py provides DB thread-pool and Redis state-lock injection.
"""
from typing import AsyncGenerator, Optional
import redis.asyncio as aioredis
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import settings
from app.core.database import AsyncSessionLocal


# === Redis Client (lazy initialization) ===
_redis_client: Optional[aioredis.Redis] = None


async def get_redis() -> Optional[aioredis.Redis]:
    """
    Returns a shared Redis client for pub/sub and state-lock operations.
    Returns None if Redis is unreachable (graceful degradation).
    """
    global _redis_client
    if _redis_client is not None:
        try:
            await _redis_client.ping()
        except Exception:
            _redis_client = None

    if _redis_client is None:
        try:
            _redis_client = aioredis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                db=settings.REDIS_DB,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_keepalive=True,
            )
            await _redis_client.ping()
        except Exception:
            # Redis is optional for stub_mode / cold-start — graceful degradation
            _redis_client = None

    return _redis_client


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency: yields an async SQLAlchemy session.
    Commits on success, rolls back on exception.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
