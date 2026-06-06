"""
AI-NUSS 3.0 — Job REST Endpoints (Real Processing)
Now backed by JobStore + async processing pipeline.
"""
import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from app.core.job_store import store
from app.core.processor import process_job

router = APIRouter()


# ═══════════════════════════════════════════════════════════
# Request Schemas (inline for simplicity)
# ═══════════════════════════════════════════════════════════

class SubmitRequest(BaseModel):
    file_text: str = ""
    file_type: str = "txt"
    novel_title: str = "Untitled"
    file_name: str = ""
    config: dict = {}


# ═══════════════════════════════════════════════════════════
# POST /api/v1/jobs/submit
# ═══════════════════════════════════════════════════════════

@router.post("/submit")
async def submit_novel_job(req: SubmitRequest, background_tasks: BackgroundTasks):
    """
    Submit a novel for adaptation.
    Creates a job, stores the text, and kicks off background processing.
    """
    # Create job
    job = await store.create_job(
        novel_title=req.novel_title or req.file_name or "Untitled",
        file_text=req.file_text,
        file_name=req.file_name,
    )

    # Kick off async processing in background
    background_tasks.add_task(process_job, job.job_id)

    return {
        "job_id": job.job_id,
        "novel_id": job.novel_id,
        "status": "processing",
        "review_status": "uploading",
        "message": f"Job created. Processing started for '{job.novel_title}'",
    }


# ═══════════════════════════════════════════════════════════
# GET /api/v1/jobs/{job_id}/status
# ═══════════════════════════════════════════════════════════

@router.get("/{job_id}/status")
async def get_job_status(job_id: str):
    """
    Get current job status with full state snapshot.
    Used for state reconciliation after WebSocket disconnect.
    """
    job = await store.get_job(job_id)

    if not job:
        return {
            "job_id": job_id,
            "novel_id": "NOT_FOUND",
            "review_status": "error",
            "progress_pct": 0.0,
            "current_step": "Job not found",
            "event_log": [],
            "last_error": "Job not found",
            "updated_at": datetime.now(timezone.utc).isoformat() + "Z",
        }

    return {
        "job_id": job.job_id,
        "novel_id": job.novel_id,
        "novel_title": job.novel_title,
        "review_status": job.review_status,
        "current_chapter_index": job.state.get("current_chapter_index", 0),
        "progress_pct": job.progress_pct,
        "current_step": job.current_step,
        "event_log": job.state.get("event_log", [])[-50:],  # Last 50 events
        "last_error": job.state.get("last_error"),
        "updated_at": job.updated_at,
        # Full data payloads (for tab rendering)
        "scenes": job.state.get("scenes", []),
        "beats": job.state.get("beats", []),
        "master_cast_list": job.state.get("master_cast_list", []),
        "entity_map": job.state.get("entity_map", {}),
        "screenplay": job.state.get("screenplay", {}),
        "story_bible": job.state.get("story_bible", {}),
    }


# ═══════════════════════════════════════════════════════════
# GET /api/v1/jobs — List all jobs (history)
# ═══════════════════════════════════════════════════════════

@router.get("/")
async def list_jobs():
    """List all jobs — for history view."""
    jobs = await store.list_jobs()
    return {"jobs": sorted(jobs, key=lambda j: j["created_at"], reverse=True)}


# ═══════════════════════════════════════════════════════════
# POST /api/v1/jobs/{job_id}/review/*
# ═══════════════════════════════════════════════════════════

@router.post("/{job_id}/review/bible-character")
async def review_bible_character(job_id: str, review: dict):
    return {
        "job_id": job_id,
        "action": review.get("action", "confirm"),
        "status": "acknowledged",
        "message": "Review recorded",
    }


@router.post("/{job_id}/review/scenes")
async def review_scenes(job_id: str, review: dict):
    return {
        "job_id": job_id,
        "action": review.get("action", "confirm"),
        "status": "acknowledged",
        "message": "Review recorded",
    }
