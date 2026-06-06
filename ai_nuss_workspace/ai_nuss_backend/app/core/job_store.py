"""
AI-NUSS 3.0 — In-Memory Job Store
Single source of truth for all running/completed jobs.
Supports async event broadcasting for WebSocket streaming.
"""
import asyncio
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Callable, Awaitable


# Event callback type: async function receiving (job_id, event_name, payload)
EventCallback = Callable[[str, str, Dict[str, Any]], Awaitable[None]]


class JobRecord:
    """A single job's complete state."""

    def __init__(self, job_id: str, novel_title: str = ""):
        self.job_id = job_id
        self.novel_id = f"NOV_{datetime.now(timezone.utc).strftime('%Y%m%d')}_{uuid.uuid4().hex[:6]}"
        self.novel_title = novel_title
        self.review_status = "uploading"  # uploading → analyzing → generating → completed
        self.progress_pct = 0.0
        self.current_step = ""
        self.created_at = datetime.now(timezone.utc).isoformat() + "Z"
        self.updated_at = self.created_at

        # Full state (matches AINUSSState schema)
        self.state: Dict[str, Any] = {
            "novel_id": self.novel_id,
            "job_id": self.job_id,
            "current_chapter_index": 0,
            "genre_profile": "general",
            "story_bible_version": 0,
            "entity_map_version": 0,
            "scene_version": 0,
            "story_bible": {},
            "master_cast_list": [],
            "entity_map": {},
            "timeline": {},
            "scenes": [],
            "beats": [],
            "screenplay": {},
            "confidence_report": [],
            "event_log": [],
            "retry_count": 0,
            "last_error": None,
            "review_status": "uploading",
        }

        # Raw uploaded file info
        self.file_name: Optional[str] = None
        self.file_text: Optional[str] = None


class JobStore:
    """
    Thread-safe in-memory store for all jobs.
    Notifies listeners on state changes for WebSocket broadcasting.
    """

    def __init__(self):
        self._jobs: Dict[str, JobRecord] = {}
        self._listeners: List[EventCallback] = []
        self._lock = asyncio.Lock()

    async def create_job(self, novel_title: str = "", file_text: str = "", file_name: str = "") -> JobRecord:
        """Create a new job and return it."""
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        job = JobRecord(job_id, novel_title)
        job.file_text = file_text
        job.file_name = file_name
        job.state["job_id"] = job_id
        job.state["novel_id"] = job.novel_id

        async with self._lock:
            self._jobs[job_id] = job

        await self._notify(job_id, "job_created", {"job_id": job_id, "novel_id": job.novel_id})
        return job

    async def get_job(self, job_id: str) -> Optional[JobRecord]:
        async with self._lock:
            return self._jobs.get(job_id)

    async def update_job(self, job_id: str, **kwargs) -> Optional[JobRecord]:
        """Update job fields and broadcast change event."""
        job = await self.get_job(job_id)
        if not job:
            return None

        async with self._lock:
            for key, value in kwargs.items():
                if hasattr(job, key):
                    setattr(job, key, value)
                if key in job.state:
                    job.state[key] = value
            job.updated_at = datetime.now(timezone.utc).isoformat() + "Z"

        await self._notify(job_id, "job_updated", {
            "review_status": job.review_status,
            "progress_pct": job.progress_pct,
            "current_step": job.current_step,
        })
        return job

    async def update_state(self, job_id: str, state_updates: Dict[str, Any]) -> Optional[JobRecord]:
        """Merge updates into job.state and broadcast."""
        job = await self.get_job(job_id)
        if not job:
            return None

        async with self._lock:
            job.state.update(state_updates)
            # Sync top-level fields
            if "review_status" in state_updates:
                job.review_status = state_updates["review_status"]
            job.updated_at = datetime.now(timezone.utc).isoformat() + "Z"

        return job

    async def add_event(self, job_id: str, event: str, payload: Dict[str, Any]) -> None:
        """Add an event to the job's event log and broadcast."""
        job = await self.get_job(job_id)
        if not job:
            return

        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat() + "Z",
            "event": event,
            **payload,
        }

        async with self._lock:
            job.state.setdefault("event_log", []).append(entry)

        await self._notify(job_id, event, payload)

    async def list_jobs(self) -> List[Dict[str, Any]]:
        """List all jobs (for history)."""
        async with self._lock:
            return [
                {
                    "job_id": j.job_id,
                    "novel_id": j.novel_id,
                    "novel_title": j.novel_title,
                    "review_status": j.review_status,
                    "progress_pct": j.progress_pct,
                    "created_at": j.created_at,
                    "updated_at": j.updated_at,
                    "file_name": j.file_name,
                }
                for j in self._jobs.values()
            ]

    # --- Event System ---

    def add_listener(self, callback: EventCallback) -> None:
        """Register a callback to receive job events (for WebSocket broadcasting)."""
        self._listeners.append(callback)

    def remove_listener(self, callback: EventCallback) -> None:
        """Unregister a callback."""
        if callback in self._listeners:
            self._listeners.remove(callback)

    async def _notify(self, job_id: str, event: str, payload: Dict[str, Any]) -> None:
        """Notify all listeners of a job event."""
        for listener in self._listeners:
            try:
                await listener(job_id, event, payload)
            except Exception:
                pass  # Don't let one broken listener break everything


# Global singleton
store = JobStore()
