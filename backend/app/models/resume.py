"""Resume ORM model."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Integer, String, Text, DateTime, JSON, Float, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    structured_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # Phase 5 §8.36: marks structured_json schema version. ``None`` for legacy
    # rows (pre-Phase-5 ad-hoc dict); ``"json-resume-1.0.0+resumeai"`` for new
    # uploads (JSON Resume schema with desiredSalary/desiredLocation extensions).
    # Frontend uses this to decide which renderer to apply.
    schema_version: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Phase 5 §8.36 A11: replaces the ``<!--lh:1.7-->`` HTML comment hack.
    # ``None`` falls back to default 1.7 on the frontend; legacy rows keep
    # the lh comment in ``html`` and the frontend parser still honours it
    # when this column is null (transitional bridge).
    line_height: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    record_type: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, default="legacy")
    # Phase 7 §8.48: 'master_pool' | 'snapshot' | 'candidate' | 'legacy'
    vector_ptr: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # 2026-05-08 §8.12: timezone-aware (was naïve UTC `datetime.utcnow`).
    # Naïve UTC serialized as ISO-8601 without `+00:00`, which JS `new Date()`
    # interpreted as local time → frontend showed `created_at` 8h late in CST.
    # Now stamped as aware UTC; Pydantic emits `+00:00` suffix; frontend
    # `formatDateTime()` converts to Asia/Shanghai. See MEMORY/LOG.md §8.12.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )