# backend/app/schemas/resume.py
"""Resume Pydantic schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class ResumeCreate(BaseModel):
    filename: str
    storage_path: str
    structured_json: Optional[dict] = None
    raw_text: Optional[str] = None
    vector_ptr: Optional[str] = None


class ResumeUpdate(BaseModel):
    filename: str


class ResumeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    storage_path: str
    structured_json: Optional[dict]
    schema_version: Optional[str] = None  # Phase 5 §8.36: marks structured_json schema
    raw_text: Optional[str]
    line_height: Optional[float] = None  # Phase 5 §8.36 A11: replaces <!--lh:1.7--> hack
    vector_ptr: Optional[str]
    record_type: Optional[str] = None  # Phase 7 §8.48: 'master_pool' | 'snapshot' | 'candidate' | 'legacy'
    created_at: datetime
