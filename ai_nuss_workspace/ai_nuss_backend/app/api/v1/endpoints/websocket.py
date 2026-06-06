"""
AI-NUSS 3.0 — WebSocket Real-Time Streaming (Real Events)
Subscribes to JobStore events and pushes them to clients.
"""
import asyncio
import json
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.job_store import store
from app.schemas.workflow import WebSocketFrame

router = APIRouter()

# Active WebSocket connections: {job_id: [WebSocket, ...]}
_active_connections: dict[str, list[WebSocket]] = {}


async def _broadcast_to_job(job_id: str, event: str, payload: dict):
    """Send a frame to all WebSocket clients watching a specific job."""
    if job_id not in _active_connections:
        return

    frame = WebSocketFrame(
        event=event,
        timestamp=datetime.now(timezone.utc).isoformat() + "Z",
        payload=payload,
    )
    data = frame.model_dump_json()

    dead = []
    for ws in _active_connections.get(job_id, []):
        try:
            await ws.send_text(data)
        except Exception:
            dead.append(ws)

    for ws in dead:
        if ws in _active_connections.get(job_id, []):
            _active_connections[job_id].remove(ws)


# Register broadcast callback with JobStore on module load
async def _on_job_event(job_id: str, event: str, payload: dict):
    await _broadcast_to_job(job_id, event, payload)


store.add_listener(_on_job_event)


@router.websocket("/jobs/{job_id}/stream")
async def job_stream(websocket: WebSocket, job_id: str):
    """
    WebSocket stream for real-time job progress.
    Receives live events from the JobStore event system.
    """
    await websocket.accept()

    # Register connection
    _active_connections.setdefault(job_id, []).append(websocket)

    # Send current state immediately
    job = await store.get_job(job_id)
    if job:
        await _broadcast_to_job(job_id, "state_snapshot", {
            "review_status": job.review_status,
            "progress_pct": job.progress_pct,
            "current_step": job.current_step,
            "event_log": job.state.get("event_log", [])[-20:],
        })

    try:
        # Keep connection alive
        while True:
            await asyncio.sleep(30)
            try:
                await websocket.send_text(json.dumps({
                    "event": "heartbeat",
                    "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
                    "payload": {},
                }))
            except Exception:
                break

    except WebSocketDisconnect:
        pass
    finally:
        if job_id in _active_connections:
            _active_connections[job_id] = [
                ws for ws in _active_connections[job_id] if ws != websocket
            ]
            if not _active_connections[job_id]:
                del _active_connections[job_id]
