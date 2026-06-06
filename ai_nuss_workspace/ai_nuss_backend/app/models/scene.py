"""
AI-NUSS 3.0 — Scene ORM Model
Physical truth table for adaptive scene segmentation.
Per spec Chapter 3 Module 4: Scene metadata with explainable trace.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Integer, DateTime, JSON, Boolean, Float, ForeignKey,
)
from app.core.database import Base


class Scene(Base):
    """
    Single Source of Truth — Scene segmentation results.
    Each scene is a contiguous block of the novel identified by the
    deterministic scene scoring engine (Chapter 15 §2).
    """

    __tablename__ = "scenes"

    # === Primary Key ===
    scene_id = Column(
        String(64),
        primary_key=True,
        default=lambda: f"SC_{uuid.uuid4().hex[:8].upper()}",
        comment="Unique scene identifier, e.g. SC_001_01",
    )

    # === Version Control ===
    version = Column(
        Integer,
        nullable=False,
        default=1,
        comment="Monotonically increasing version number for this scene record",
    )

    # === Identity & Ordering ===
    scene_number = Column(Integer, nullable=False, default=0, comment="Sequential scene number in the screenplay")
    novel_id = Column(
        String(64),
        ForeignKey("novels.novel_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chapter_index = Column(Integer, nullable=True, comment="Source chapter index")

    # === Scene Metadata (per spec Module 4) ===
    metadata_json = Column(
        JSON,
        nullable=True,
        default=dict,
        comment="Scene metadata: location, time_of_day, timeline_mode, pov_character_id",
    )

    # === Scene Explainable Trace (per spec Module 4) ===
    explainable_trace = Column(
        JSON,
        nullable=True,
        default=dict,
        comment="Scoring trace: location_changed, time_changed, objective_changed, score_computed, reason",
    )

    # === Raw Text Block ===
    raw_scene_text_block = Column(Text, nullable=True, comment="Raw novel text for this scene block")

    # === Scene Summary ===
    summary = Column(Text, nullable=True, comment="AI-generated scene summary")
    scene_goal = Column(Text, nullable=True, comment="Dramatic goal of this scene")

    # === Timeline Mode (per spec Chapter 2) ===
    timeline_mode = Column(
        String(16),
        nullable=True,
        default="sequential",
        comment="sequential|flashback|parallel|montage",
    )
    flashback_details = Column(JSON, nullable=True, comment="Flashback trigger medium and details if timeline_mode=flashback")

    # === Cast in Scene ===
    character_ids = Column(JSON, nullable=True, default=list, comment="Character IDs appearing in this scene")

    # === Confidence ===
    scene_score = Column(Float, nullable=True, default=0.0, comment="Computed scene break score [0, 1]")

    # === Audit ===
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    is_deleted = Column(Boolean, nullable=False, default=False)

    def __repr__(self):
        return f"<Scene(id={self.scene_id}, num={self.scene_number}, mode={self.timeline_mode}, v{self.version})>"
