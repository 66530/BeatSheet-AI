"""
AI-NUSS 3.0 — API v1 Router Aggregator
Aggregates all endpoint sub-routers under /api/v1.
"""
from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    jobs,
    websocket,
)

api_v1_router = APIRouter(prefix="/api/v1")

# === Authentication (login / token) ===
api_v1_router.include_router(
    auth.router,
    prefix="/auth",
    tags=["Auth"],
)

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

# === Model Configuration Test ===
from app.api.v1.endpoints.jobs import test_model_connection, ModelTestRequest

@api_v1_router.post("/model/test", tags=["Model"])
async def model_test(req: ModelTestRequest):
    return await test_model_connection(req)
