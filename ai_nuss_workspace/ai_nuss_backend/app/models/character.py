"""
AI-NUSS 3.0 — Character ORM Model
Physical truth table with core personality traits & Taboo constraints.
Per spec Chapter 3 Module 3: master_cast_list canonical store.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Integer, DateTime, JSON, Boolean, Float, ForeignKey,
)
from app.core.database import Base


class Character(Base):
    """
    Single Source of Truth — Character profiles with hard constraints.
    The `constraints` JSON field stores the spec-defined constraint block:
      - current_belief, current_goal, emotional_state, internal_conflict, taboos
    The `entity_map_aliases` JSON field tracks all known aliases.
    """

    __tablename__ = "characters"

    # === Primary Key ===
    character_id = Column(
        String(64),
        primary_key=True,
        default=lambda: f"CH_{uuid.uuid4().hex[:8].upper()}",
        comment="Canonical character identifier, e.g. CH_LIN",
    )

    # === Version Control ===
    version = Column(
        Integer,
        nullable=False,
        default=1,
        comment="Monotonically increasing version number for this character record",
    )

    # === Identity ===
    canonical_name = Column(
        String(256),
        nullable=False,
        default="Unknown Character",
        comment="Canonical resolved name, e.g. 林雨欣",
    )
    aliases = Column(
        JSON,
        nullable=True,
        default=list,
        comment="All known aliases/绰号 for this character",
    )

    # === Novel Association ===
    novel_id = Column(
        String(64),
        ForeignKey("novels.novel_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="Associated novel",
    )

    # === Core Personality & Drama Constraints (per spec Module 3) ===
    constraints = Column(
        JSON,
        nullable=True,
        default=dict,
        comment="Character constraints: current_belief, current_goal, emotional_state, internal_conflict, taboos",
    )

    # === Physical Description ===
    description = Column(Text, nullable=True, comment="Physical and personality description")
    age_range = Column(String(32), nullable=True, comment="e.g. 25-30")
    gender = Column(String(16), nullable=True)

    # === Role & Archetype ===
    role = Column(String(64), nullable=True, default="supporting", comment="protagonist|antagonist|supporting|cameo")
    archetype = Column(String(128), nullable=True, comment="Narrative archetype")

    # === Vector Embedding Reference (for Qdrant fuzzy recall) ===
    qdrant_point_id = Column(String(64), nullable=True, comment="Corresponding Qdrant point ID for semantic search")

    # === Confidence ===
    confidence_score = Column(Float, nullable=True, default=1.0, comment="NER resolution confidence [0, 1]")

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
        return f"<Character(id={self.character_id}, name={self.canonical_name}, v{self.version})>"


class EntityMap(Base):
    """
    Alias → Canonical Character ID mapping table.
    Per spec Chapter 2: If alias exists in entity_map, lock character_id immediately.
    """

    __tablename__ = "entity_maps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    novel_id = Column(String(64), ForeignKey("novels.novel_id", ondelete="CASCADE"), nullable=False, index=True)
    alias = Column(String(256), nullable=False, index=True, comment="Raw entity text, e.g. 大小姐, 王局长")
    character_id = Column(String(64), ForeignKey("characters.character_id", ondelete="CASCADE"), nullable=False)
    confidence = Column(Float, nullable=False, default=1.0, comment="Resolution confidence [0, 1]")
    version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    def __repr__(self):
        return f"<EntityMap({self.alias} -> {self.character_id})>"
