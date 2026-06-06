"""
AI-NUSS 3.0 — FastAPI Async Entry Point
PHASE P0 CONTRACT:
  - GET /health MUST return {"status": "healthy"} with HTTP 200, NO DB dependency.
  - POST /api/v1/jobs/submit MUST NOT crash when 0 API keys are configured.
  - App MUST cold-start in <1.5s via: uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import time

from app.core.config import settings
from app.api.v1.router import api_v1_router


# ═══════════════════════════════════════════════════════════════════════
# Application Lifespan (startup / shutdown hooks)
# ═══════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    PHASE P0: Minimal lifespan — no DB init required for cold-start.
    PHASE P2: Add init_db() and Redis connection pool warmup.
    """
    # Startup
    app.state.startup_time = time.time()
    # TODO (PHASE P2): await init_db() — create tables on startup
    # TODO (PHASE P2): Warm up Redis connection pool
    yield
    # Shutdown
    # TODO (PHASE P2): Gracefully close DB engine, Redis connections


# ═══════════════════════════════════════════════════════════════════════
# FastAPI Application
# ═══════════════════════════════════════════════════════════════════════

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Novel-to-Screenplay AI Adaptation Engine — LangGraph-powered full-stack pipeline",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# === CORS Middleware (allow Next.js dev server) ===
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# === Global Exception Middleware ===
@app.middleware("http")
async def global_exception_handler(request: Request, call_next):
    """
    Catch-all exception middleware.
    Ensures the API never returns an unhandled 500 without structured error info.
    """
    try:
        response = await call_next(request)
        return response
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={
                "error": "INTERNAL_SERVER_ERROR",
                "error_code": type(exc).__name__,
                "message": str(exc),
                "path": str(request.url.path),
            },
        )


# ═══════════════════════════════════════════════════════════════════════
# GET /health — Health Check Probe (PHASE P0 CONTRACT)
# MUST: Return {"status": "healthy"} with HTTP 200.
# MUST: NO database connectivity check required.
# MUST: NO authentication required.
# ═══════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health_check():
    """
    Hardcoded health probe. Returns 200 OK unconditionally.

    PHASE P0 CONTRACT (Chapter 14 §1):
      - No database dependency
      - No authentication required
      - Hardcoded response: {"status": "healthy"}
      - HTTP status code: 200 OK
    """
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "app": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "stub_mode": settings.STUB_MODE,
        },
    )


# ═══════════════════════════════════════════════════════════════════════
# API v1 Router
# ═══════════════════════════════════════════════════════════════════════

app.include_router(api_v1_router)


# ═══════════════════════════════════════════════════════════════════════
# Root Redirect
# ═══════════════════════════════════════════════════════════════════════

@app.get("/")
async def root():
    """Root endpoint — redirects to API docs."""
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
        "health": "/health",
    }
