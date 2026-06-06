"""
AI-NUSS 3.0 — Explicit Global GraphState TypedDict Definition
Per spec Chapter 5: All state fields are version-aware and audit-traced.
"""
from typing import TypedDict, List, Dict, Any, Optional


class AINUSSState(TypedDict, total=False):
    """
    The single global state object flowing through the LangGraph DAG.
    Every field mutation is atomically logged to `event_log`.

    State Contract (Chapter 12):
      - review_status drives the user-facing state projection:
        "uploading" | "analyzing" | "pending_character" | "pending_scene"
        | "generating" | "completed" | "error"
    """

    # === Job & Novel Identity ===
    novel_id: str                          # Unique novel identifier, e.g. "NOV_2026_001"
    job_id: str                            # Async task UUID for this run
    current_chapter_index: int             # Which chapter the state machine is processing
    genre_profile: str                     # Detected/configured genre, e.g. "romance_drama"

    # === Version Counters (incremented on each mutation) ===
    story_bible_version: int               # Version number for Story Bible
    entity_map_version: int                # Version number for Entity Map
    scene_version: int                     # Version number for Scene list

    # === Narrative Data Payloads ===
    story_bible: Dict[str, Any]            # World setting, organizations, global rules
    master_cast_list: List[Dict[str, Any]] # Canonical character profiles with constraints
    entity_map: Dict[str, str]             # Alias → canonical character_id mapping
    timeline: Dict[str, Any]               # Temporal structure of the story

    # === Scene, Beat, Screenplay Structures ===
    scenes: List[Dict[str, Any]]           # Adaptive scene segmentation output
    beats: List[Dict[str, Any]]            # Causality-chain beats per scene
    screenplay: Dict[str, Any]             # Final screenplay elements tree

    # === Audit & Diagnostics ===
    confidence_report: List[Dict[str, Any]] # Per-decision confidence scores
    event_log: List[Dict[str, Any]]         # Atomic state-change audit trail
    retry_count: int                        # Number of retries for the current operation
    last_error: Optional[str]               # Most recent error message, if any

    # === User-Facing Review Status ===
    review_status: str                     # Drives UI state projection (STATE_A through STATE_E)
