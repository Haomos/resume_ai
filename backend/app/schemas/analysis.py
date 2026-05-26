# backend/app/schemas/analysis.py
"""Analysis Pydantic schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class AnalysisResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    resume_id: int
    job_id: int
    base_score: float
    # Phase 7c: fit dimensions schema changed from 6 fixed int fields to
    # 5 free-form float fields. Using dict avoids Pydantic validation
    # errors when old rows (skill_match/int/0-100) coexist with new rows
    # (skills_fit/float/0.0-1.0).
    dimension_scores_json: Optional[dict] = None
    total_score: float
    model_config_json: Optional[dict]
    created_at: datetime
