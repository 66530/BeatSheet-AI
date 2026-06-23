"""
AI-NUSS 3.0 — Job REST Endpoints (Real Processing)
Now backed by JobStore + async processing pipeline.
"""
import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from app.core.job_store import store
from app.core.processor import process_job
from app.core.llm_factory import test_llm_connection

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
    llm_config: dict = {}  # 用户模型配置 (不能叫 model_config，Pydantic 保留字段)


# ═══════════════════════════════════════════════════════════
# POST /api/v1/jobs/submit
# ═══════════════════════════════════════════════════════════

@router.post("/submit")
async def submit_novel_job(req: SubmitRequest, background_tasks: BackgroundTasks):
    """
    Submit a novel for adaptation.
    Creates a job, stores the text, and kicks off background processing.
    """
    # Create job with user model config
    job = await store.create_job(
        novel_title=req.novel_title or req.file_name or "Untitled",
        file_text=req.file_text,
        file_name=req.file_name,
        model_config=req.llm_config or {},
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

    # ── 确保每个 scene 都有 location_type（API 出口兜底）──
    scenes = job.state.get("scenes", [])
    if scenes:
        from app.graph.agents.scene_agent import LocationExtractor as _LE
        for _s in scenes:
            if not _s.get("location_type"):
                _s["location_type"] = _LE.classify_indoor_outdoor(_s.get("location", ""))

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
        "scenes": scenes,
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


# ═══════════════════════════════════════════════════════════
# POST /api/v1/model/test — 测试模型连接
# ═══════════════════════════════════════════════════════════

class ModelTestRequest(BaseModel):
    provider: str = ""
    base_url: str = ""
    model: str = ""
    api_key: str = ""

@router.post("/model/test")
async def test_model_connection(req: ModelTestRequest):
    """Test a model configuration by sending a minimal request."""
    result = await test_llm_connection({
        "provider": req.provider,
        "base_url": req.base_url,
        "model": req.model,
        "api_key": req.api_key,
    })
    return result


# ═══════════════════════════════════════════════════════════
# POST /api/v1/jobs/{job_id}/local-edit — AI Local Editing
# Registered directly on jobs.router to guarantee no routing issues.
# ═══════════════════════════════════════════════════════════

from app.api.v1.endpoints.local_edit import LocalEditRequest, LocalEditResponse, SYSTEM_PROMPTS, USER_PROMPTS

@router.post("/{job_id}/local-edit", response_model=LocalEditResponse)
async def local_edit_on_jobs_router(job_id: str, req: LocalEditRequest):
    """
    AI local editing — rewrite/expand/shorten/change-tone/regenerate on selected text.
    Uses the job's model_config to call the LLM.
    """
    import asyncio, os
    from app.core.llm_factory import create_llm_client

    job = await store.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=404,
            detail=f"Job '{job_id}' not found. The backend may have restarted. Please refresh the page and try again."
        )

    mc = job.state.get("model_config", {})
    if not mc.get("base_url") or not mc.get("api_key"):
        env_key = os.getenv("DEEPSEEK_API_KEY", "")
        env_base = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
        if env_key:
            mc = {"base_url": env_base, "model": "deepseek-chat", "api_key": env_key}
        else:
            raise HTTPException(status_code=400, detail="Model not configured. Please set up API key in model config.")

    operation = req.operation
    tone = req.tone or "emotional"
    custom = f"\n\nUser's specific direction: {req.custom_instruction}" if req.custom_instruction else ""

    system_prompt = SYSTEM_PROMPTS[operation].format(tone=tone)
    user_prompt = USER_PROMPTS[operation].format(
        selected_text=req.selected_text,
        tone=tone,
        custom_instruction=custom,
        previous_scene=req.previous_scene or "(no previous scene)",
        next_scene=req.next_scene or "(no next scene)",
    )

    try:
        client = create_llm_client(mc)
        model = (mc.get("model") or "").strip() or "deepseek-chat"
        resp = await asyncio.wait_for(
            client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.7,
                max_tokens=min(4096, max(512, len(req.selected_text) * 3)),
                timeout=45.0,
            ),
            timeout=60.0,
        )
        edited_text = resp.choices[0].message.content or ""
        edited_text = edited_text.strip()
        if edited_text.startswith("```"):
            lines = edited_text.split("\n")
            edited_text = "\n".join(l for l in lines if not l.strip().startswith("```")).strip()
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="LLM request timed out. Please try again.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM request failed: {type(e).__name__}: {str(e)[:200]}")

    if not edited_text or len(edited_text) < 5:
        raise HTTPException(status_code=422, detail="AI returned empty result. Try again.")

    return LocalEditResponse(
        edited_text=edited_text,
        operation=operation,
        original_length=len(req.selected_text),
        edited_length=len(edited_text),
    )


# ═══════════════════════════════════════════════════════════
# POST /api/v1/jobs/{job_id}/retry — 重试失败任务
# ═══════════════════════════════════════════════════════════

@router.post("/{job_id}/retry")
async def retry_job(job_id: str, background_tasks: BackgroundTasks):
    """
    重新运行已失败的任务。
    使用原任务存储的文件文本和模型配置重新启动流水线。
    """
    job = await store.get_job(job_id)

    if not job:
        return {
            "job_id": job_id,
            "status": "error",
            "message": "任务不存在",
        }

    if not job.file_text:
        return {
            "job_id": job_id,
            "status": "error",
            "message": "任务没有存储的文件文本，无法重试。请重新上传。",
        }

    # 重置任务状态
    await store.update_job(job_id,
        review_status="uploading",
        progress_pct=0,
        current_step="重试中..."
    )

    # 重置状态数据（保留 model_config 和原始文件）
    await store.update_state(job_id, {
        "review_status": "uploading",
        "event_log": [],
        "last_error": None,
        "retry_count": job.state.get("retry_count", 0) + 1,
        "scenes": [],
        "beats": [],
        "screenplay": {},
    })

    # 重新启动后台处理
    background_tasks.add_task(process_job, job_id)

    return {
        "job_id": job_id,
        "novel_id": job.novel_id,
        "status": "retrying",
        "message": f"任务已重新启动，开始重试",
        "retry_count": job.state.get("retry_count", 0),
    }
