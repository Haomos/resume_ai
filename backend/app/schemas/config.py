# backend/app/schemas/config.py
"""Config Pydantic schemas."""

from typing import Literal, Optional

from pydantic import BaseModel, Field


class LLMConfigUpdate(BaseModel):
    provider_type: Optional[Literal["ollama", "openai_compatible", "anthropic"]] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    model_name: Optional[str] = None
    temperature: Optional[float] = Field(default=None, ge=0.0, le=2.0)


class LLMConfigResponse(BaseModel):
    provider_type: str
    base_url: str
    model_name: str
    temperature: float
    # 不直接返回 api_key（避免在浏览器/日志中回显敏感数据）；
    # 仅告知前端是否已存储过 key（用于显示"已设置"状态）。
    has_api_key: bool = False


class EmbeddingConfigResponse(BaseModel):
    model_name: str
    device: str
    normalize: bool


class RecommendedModelsResponse(BaseModel):
    providers: list[str]
    models: dict[str, list[str]]


# ─── Phase 4 — 模型预设切换 ──────────────────────────────
# LLMPreset 数据定义在 services/llm_presets.py（单一真理源），此处仅做容器响应类。
# 该 import 故意置于本文件主 schemas 之后，避免无关导入污染顶部命名空间。
from app.services.llm_presets import LLMPreset, ProviderType  # noqa: E402


class PresetsResponse(BaseModel):
    """GET /api/config/presets 返回体."""

    presets: list[LLMPreset]
    active_preset_id: Optional[str] = Field(
        default=None,
        description="当前生效 (provider_type, base_url) 匹配到的 preset id；None = 自定义",
    )


# ─── Phase 4 — 自定义预设槽位（最多3个）──────────────────────

class CustomPreset(BaseModel):
    """用户保存的自定义 LLM 配置槽位."""

    id: str = Field(..., description="前端生成的稳定 ID (uuid 或 timestamp)")
    name: str = Field(..., description="卡片展示名称，通常取 model_name 或用户编辑")
    provider_type: ProviderType
    base_url: str
    model_name: str
    temperature: float = Field(default=0.5, ge=0.0, le=2.0)


class CustomPresetsResponse(BaseModel):
    presets: list[CustomPreset]
    max_slots: int = 3


class TestConnectionResponse(BaseModel):
    """POST /api/config/test 返回体. 失败时 ok=False，error 含截断后的异常信息."""

    ok: bool
    model: Optional[str] = None
    preview: Optional[str] = Field(default=None, description="模型回包前 80 字符预览")
    error: Optional[str] = None