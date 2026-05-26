# backend/app/schemas/job.py
"""Job Pydantic schemas."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class JobCreate(BaseModel):
    source_url: Optional[str] = None
    company: Optional[str] = None
    position: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    location: Optional[str] = None
    raw_text: str
    structured_json: Optional[dict] = None


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source_url: Optional[str]
    company: Optional[str]
    position: Optional[str]
    salary_min: Optional[float]
    salary_max: Optional[float]
    location: Optional[str]
    raw_text: Optional[str]
    structured_json: Optional[dict]
    created_at: datetime


class JobPreviewResponse(BaseModel):
    """GET /api/jobs/preview 返回体 — 仅抓取，不写库.

    前端 SeekerJobs / RecruiterJobs 用于"链接抓取 → 表单自动填充 → 用户审阅 → 手动保存"流程。
    """

    source_url: str
    raw_text: str


class JobExtractRequest(BaseModel):
    """POST /api/jobs/extract 入参 — 用户粘贴的整段 JD 文本。

    用户从招聘网站复制整段 JD（含位、薪、地、司、职责、要求等）后，前端调本端点
    LLM 自动填充表单的 position/company/salary_min/salary_max/location 字段。
    """

    raw_text: str = Field(..., min_length=10, max_length=10000,
                          description="粘贴的 JD 完整正文（10-10000 字）")


class JobExtractResponse(BaseModel):
    """POST /api/jobs/extract 返回体 — LLM 抽取的结构化字段.

    设计原则:
    - 字段不在原文中明确出现时返回 ``None``（前端保留用户已填值，不覆盖）
    - LLM 调用失败 / JSON 解析失败 → ``ok=False`` + ``error`` 字符串（不抛 5xx）
    - 与 ``/api/config/test`` 的 graceful 模式一致
    """

    ok: bool
    position: Optional[str] = None
    company: Optional[str] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    location: Optional[str] = None
    error: Optional[str] = Field(default=None, description="ok=False 时的失败原因截断字符串")
    model: Optional[str] = Field(default=None, description="本次抽取使用的模型名（用于前端调试显示）")