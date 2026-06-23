"""
AI-NUSS 3.0 — SQLAlchemy Async Engine Initialization
PHASE P0: PostgreSQL as the Single Source of Truth.
CRITICAL: Engine is lazily initialized — NO database connectivity at import time.
           This ensures /health and POST /api/v1/jobs/submit work cold with 0 deps.
"""
from typing import Optional
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker,
    AsyncEngine,
)
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings


# === Lazy Engine (created on first use, NOT at import time) ===
_engine: Optional[AsyncEngine] = None
_AsyncSessionLocal: Optional[async_sessionmaker[AsyncSession]] = None


def _get_engine() -> AsyncEngine:
    """Lazily create or return the async engine. Safe to call at any time."""
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            settings.DATABASE_URL,
            pool_size=settings.DATABASE_POOL_SIZE,
            max_overflow=settings.DATABASE_MAX_OVERFLOW,
            echo=settings.DEBUG,
            pool_pre_ping=True,
        )
    return _engine


def _get_session_factory() -> async_sessionmaker[AsyncSession]:
    """Lazily create or return the async session factory."""
    global _AsyncSessionLocal
    if _AsyncSessionLocal is None:
        _AsyncSessionLocal = async_sessionmaker(
            bind=_get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _AsyncSessionLocal


# === Declarative Base (all ORM models inherit from this) ===
class Base(DeclarativeBase):
    """Abstract base for all physical tables. Provides version-aware metadata."""
    pass


# === Backward-compatible alias (lazy proxy) ===
# For code that references AsyncSessionLocal directly:
# Each time you call AsyncSessionLocal(), it goes through the lazy factory.
class _LazySessionFactory:
    """Proxy that defers to the lazy session factory."""
    def __call__(self, *args, **kwargs):
        return _get_session_factory()(*args, **kwargs)

    def __getattr__(self, name):
        return getattr(_get_session_factory(), name)


AsyncSessionLocal = _LazySessionFactory()


async def get_db() -> AsyncSession:
    """FastAPI dependency injection: yields an async DB session."""
    factory = _get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """
    Create all tables if they don't exist.
    Called once at application startup. Safe to run repeatedly.
    """
    # Import all models so they register on Base.metadata before create_all
    import app.models as _models  # noqa: F401
    engine = _get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def check_db_health() -> bool:
    """
    Lightweight connectivity probe. Returns True if DB is reachable.
    NOTE: /health endpoint is hardcoded and does NOT depend on this function.
    """
    try:
        factory = _get_session_factory()
        async with factory() as session:
            await session.execute(
                __import__("sqlalchemy").text("SELECT 1")
            )
        return True
    except Exception:
        return False
