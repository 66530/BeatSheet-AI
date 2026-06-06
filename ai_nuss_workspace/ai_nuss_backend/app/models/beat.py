"""
AI-NUSS 3.0 — Beat ORM Model
Physical truth table for causality-chain beats.
Per spec Chapter 3 Module 5: trigger → action → consequence chain.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Integer, DateTime, JSON, Boolean, Float, ForeignKey,
)
from app.core.database import Base


class Beat(Base):
    """
    Single Source of Truth — Dramatic micro-beats within a scene.
    Each beat represents one dramatic unit with a causality chain.
    Beat types follow the standardized control matrix:
      setup → reveal → conflict → decision → twist → climax → resolution
    """

    __tablename__ = "beats"

    # === Primary Key ===
    beat_id = Column(
        String(64),
        primary_key=True,
        default=lambda: f"B_{uuid.uuid4().hex[:8].upper()}",
        comment="Unique beat identifier, e.g. B_001",
    )

    # === Version Control ===
    version = Column(
        Integer,
        nullable=False,
        default=1,
        comment="Monotonically increasing version number for this beat record",
    )

    # === Parent References ===
    scene_id = Column(
        String(64),
        ForeignKey("scenes.scene_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="Parent scene this beat belongs to",
    )
    novel_id = Column(
        String(64),
        ForeignKey("novels.novel_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # === Beat Identity ===
    beat_number = Column(Integer, nullable=False, default=0, comment="Sequential beat number within the scene")

    # === Beat Type (Standardized Control Matrix) ===
    beat_type = Column(
        String(32),
        nullable=False,
        default="setup",
        comment="setup|reveal|conflict|decision|twist|climax|resolution",
    )
    dramatic_function = Column(Text, nullable=True, comment="What this beat does dramatically")

    # === Causality Chain (per spec Module 5) ===
    causality_chain = Column(
        JSON,
        nullable=True,
        default=dict,
        comment="{trigger: ..., action: ..., consequence: ...}",
    )

    # === Beat Content ===
    summary = Column(Text, nullable=True, comment="One-line beat summary")
    raw_text_snippet = Column(Text, nullable=True, comment="Source text that generated this beat")

    # === Screenplay Elements (per spec Module 6) ===
    elements = Column(
        JSON,
        nullable=True,
        default=list,
        comment="Array of screenplay elements: {type, character_id, content, cinematic_layer}",
    )

    # === Emotional Arc ===
    emotional_tone = Column(String(64), nullable=True, comment="Dominant emotional tone of this beat")
    intensity = Column(Float, nullable=True, default=0.5, comment="Dramatic intensity [0, 1]")

    # === Confidence ===
    confidence_score = Column(Float, nullable=True, default=1.0)

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
        return f"<Beat(id={self.beat_id}, type={self.beat_type}, scene={self.scene_id}, v{self.version})>"
