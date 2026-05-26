# backend/app/models/analysis.py
"""Analysis ORM model."""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Integer, Float, DateTime, JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Analysis(Base):
    __tablename__ = "analyses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    resume_id: Mapped[int] = mapped_column(Integer, ForeignKey("resumes.id"), nullable=False)
    job_id: Mapped[int] = mapped_column(Integer, ForeignKey("jobs.id"), nullable=False)
    # Phase 2b 新增: batch_id 用于招聘者批量评分聚合
    batch_id: Mapped[Optional[str]] = mapped_column(String(64), index=True, nullable=True)
    base_score: Mapped[float] = mapped_column(Float, nullable=False)
    dimension_scores_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    total_score: Mapped[float] = mapped_column(Float, nullable=False)
    model_config_json: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # 2026-05-08 §8.12: timezone-aware. See models/resume.py for context.
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )