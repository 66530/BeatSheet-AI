"""
AI-NUSS 3.0 — API v1 Router Aggregator
Aggregates all endpoint sub-routers under /api/v1.
"""
from fastapi import APIRouter
from app.api.v1.endpoints import (
    jobs,
    websocket,
)

api_v1_router = APIRouter(prefix="/api/v1")

# === Job submission & status (Chapter 6 §1) ===
api_v1_router.include_router(
    jobs.router,
    prefix="/jobs",
    tags=["Jobs"],
)

# === WebSocket streaming (Chapter 6 §2) ===
api_v1_router.include_router(
    websocket.router,
    prefix="/ws",
    tags=["WebSocket"],
)
