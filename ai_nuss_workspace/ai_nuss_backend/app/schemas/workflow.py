"""
AI-NUSS 3.0 — Pydantic v2 I/O Schemas & DTO Contracts
Per spec Chapter 3 (Module I/O Contracts) and Chapter 15 §3 (Three-Tier Output Contract).
"""
from typing import Optional, Dict, Any, List, Generic, TypeVar
from datetime import datetime
from pydantic import BaseModel, Field

T = TypeVar("T")


# ═══════════════════════════════════════════════════════════════════════
# CHAPTER 15 §3: Three-Tier Output Contract (统一三层大模型出站强契约)
# ═══════════════════════════════════════════════════════════════════════

class BaseOutputSchema(BaseModel, Generic[T]):
    """
    Unified three-tier LLM output contract.
    Every agent node MUST return this schema.

    Layer 1: Success — valid structured output.
    Layer 2: Fallback — heuristic rule-engine degraded output.
    Layer 3: Error — physical crash snapshot.
    """
    success: bool = Field(..., description="Whether the node executed perfectly")
    data: Optional[T] = Field(None, description="Valid structured output matching the module's schema")

    is_fallback: bool = Field(False, description="Whether LLM exception triggered rule-engine fallback")
    fallback_data: Optional[Dict[str, Any]] = Field(None, description="Safe degraded output from heuristic rules")

    error_code: Optional[str] = Field(None, description="Physical error code (e.g. DB_CONN_FAIL)")
    error_msg: Optional[str] = Field(None, description="Error stack trace snapshot")


# ═══════════════════════════════════════════════════════════════════════
# Chapter 6: REST API Contracts
# ═══════════════════════════════════════════════════════════════════════

class NovelSubmitRequest(BaseModel):
    """POST /api/v1/jobs/submit — Chapter 6 §1"""
    file_bytes: Optional[str] = Field(None, description="Base64-encoded file stream")
    file_type: str = Field("txt", description="Source file type: txt|docx|pdf")
    novel_title: Optional[str] = Field(None, description="Optional novel title override")
    config: Dict[str, Any] = Field(
        default_factory=lambda: {"auto_split_chapters": True, "remove_marketing_noise": True},
        description="Parser configuration",
    )


class NovelSubmitResponse(BaseModel):
    """Response for POST /api/v1/jobs/submit"""
    job_id: str = Field(..., description="Async task UUID")
    novel_id: str = Field(..., description="Assigned novel identifier")
    status: str = Field("processing", description="Initial job status")
    review_status: str = Field("uploading", description="User-facing state")


class JobStatusResponse(BaseModel):
    """GET /api/v1/jobs/{job_id}/status — Chapter 6 §1"""
    job_id: str
    novel_id: str
    review_status: str = Field(..., description="uploading|analyzing|pending_character|pending_scene|generating|completed|error")
    current_chapter_index: int = 0
    progress_pct: float = Field(0.0, ge=0.0, le=100.0, description="Overall progress percentage")
    event_log: List[Dict[str, Any]] = Field(default_factory=list)
    last_error: Optional[str] = None
    updated_at: Optional[str] = None


class ReviewBibleCharacterRequest(BaseModel):
    """POST /api/v1/jobs/{job_id}/review/bible-character — Chapter 6 §1"""
    action: str = Field("confirm", description="confirm|reject|merge")
    character_id: str
    canonical_name_override: Optional[str] = None
    alias_remap: Optional[Dict[str, str]] = Field(None, description="Manual alias → character_id remapping")
    constraint_overrides: Optional[Dict[str, Any]] = Field(None, description="Manual constraint corrections")


class ReviewScenesRequest(BaseModel):
    """POST /api/v1/jobs/{job_id}/review/scenes — Chapter 6 §1"""
    action: str = Field("confirm", description="confirm|reject|adjust")
    scene_adjustments: Optional[List[Dict[str, Any]]] = Field(
        None,
        description="Array of {scene_id, new_boundary_offset, merge_with_next: bool}",
    )


# ═══════════════════════════════════════════════════════════════════════
# Chapter 6 §2: WebSocket Frame Contract
# ═══════════════════════════════════════════════════════════════════════

class WebSocketFrame(BaseModel):
    """WebSocket stream frame — Chapter 6 §2"""
    event: str = Field(..., description="Event type: beat_generated|scene_segmented|character_resolved|state_changed|error")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    payload: Dict[str, Any] = Field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════
# Domain Entity Schemas (for API serialization)
# ═══════════════════════════════════════════════════════════════════════

class CharacterSchema(BaseModel):
    """Chapter 3 Module 3: Character output schema"""
    character_id: str
    canonical_name: str
    aliases: List[str] = Field(default_factory=list)
    constraints: Dict[str, Any] = Field(default_factory=dict)
    description: Optional[str] = None
    role: str = "supporting"
    confidence_score: float = Field(1.0, ge=0.0, le=1.0)


class SceneSchema(BaseModel):
    """Chapter 3 Module 4: Scene output schema"""
    scene_id: str
    scene_number: int
    chapter_index: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    explainable_trace: Dict[str, Any] = Field(default_factory=dict)
    raw_scene_text: Optional[str] = None
    summary: Optional[str] = None
    timeline_mode: str = "sequential"
    character_ids: List[str] = Field(default_factory=list)
    scene_score: float = Field(0.0, ge=0.0, le=1.0)


class BeatSchema(BaseModel):
    """Chapter 3 Module 5: Beat output schema"""
    beat_id: str
    scene_id: str
    beat_number: int
    beat_type: str = "setup"
    dramatic_function: Optional[str] = None
    causality_chain: Dict[str, Any] = Field(default_factory=dict)
    summary: Optional[str] = None
    elements: List[Dict[str, Any]] = Field(default_factory=list)
    emotional_tone: Optional[str] = None
    intensity: float = Field(0.5, ge=0.0, le=1.0)


class ScreenplayElementSchema(BaseModel):
    """Chapter 3 Module 6: Single screenplay element"""
    type: str = Field(..., description="action|dialogue|inner_monologue|caption")
    character_id: Optional[str] = None
    target_character_id: Optional[str] = None
    content: str
    emotion: Optional[str] = None
    intention: Optional[str] = None
    is_voice_over: bool = False
    cinematic_layer: Optional[Dict[str, Any]] = None
