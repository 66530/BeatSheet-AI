"""
AI-NUSS 3.0 — Novel ORM Model
Physical truth table for uploaded novel documents.
Multi-version: each revision increments `version`.
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Integer, DateTime, JSON, Boolean,
)
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class Novel(Base):
    """
    Single Source of Truth — Novel metadata and raw content.
    Versioned: each reprocessing or re-upload increments `version`.
    """

    __tablename__ = "novels"

    # === Primary Key ===
    novel_id = Column(
        String(64),
        primary_key=True,
        default=lambda: f"NOV_{datetime.now(timezone.utc).strftime('%Y%m%d')}_{uuid.uuid4().hex[:6]}",
        comment="Unique novel identifier, e.g. NOV_2026_001",
    )

    # === Version Control ===
    version = Column(
        Integer,
        nullable=False,
        default=1,
        comment="Monotonically increasing version number for this novel record",
    )

    # === Identity ===
    title = Column(String(512), nullable=False, default="Untitled Novel", comment="Novel title")
    author = Column(String(256), nullable=True, comment="Author name if known")
    genre_profile = Column(String(128), nullable=True, default="general", comment="Detected genre")

    # === Raw Content ===
    raw_text = Column(Text, nullable=True, comment="Full raw text content of the uploaded novel")
    file_type = Column(String(16), nullable=True, default="txt", comment="Source file type: txt|docx|pdf")
    chapter_count = Column(Integer, nullable=True, default=0, comment="Number of chapters parsed")

    # === Parsed Structure (JSON) ===
    chapters = Column(JSON, nullable=True, default=list, comment="Array of {chapter_index, title, raw_text} objects")
    metadata_json = Column(JSON, nullable=True, default=dict, comment="Arbitrary metadata blob")

    # === Processing State ===
    job_id = Column(String(64), nullable=True, index=True, comment="Active async job ID")
    review_status = Column(
        String(32),
        nullable=False,
        default="uploading",
        index=True,
        comment="User-facing state: uploading|analyzing|pending_character|pending_scene|generating|completed|error",
    )

    # === Audit Timestamps ===
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        comment="Record creation timestamp",
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        comment="Last mutation timestamp",
    )

    # === Soft Delete ===
    is_deleted = Column(Boolean, nullable=False, default=False, comment="Soft delete flag")

    def __repr__(self):
        return f"<Novel(novel_id={self.novel_id}, title={self.title}, v{self.version})>"
