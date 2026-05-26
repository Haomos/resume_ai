"""LLM Provider 预设清单 — 单一真理源 (Phase 4).

每个 preset 描述 (provider_type, base_url) 这一对的快捷预填值，
配套若干推荐模型与一个默认模型。前端 Settings 页用它渲染卡片，
后端 /api/config/models 也从这里派生（保持 back-compat）。

设计原则:
- 预设作为"快捷预填"，不限制用户继续手动改 base_url / api_key / model
- (provider_type, base_url) 唯一标识一个预设；改动 base_url 自动变成"自定义"
- Ollama 默认 qwen3:8b 关思考模式（OllamaProvider.enable_thinking=False 已实装）
"""

from typing import Literal

from pydantic import BaseModel, Field


ProviderType = Literal["ollama", "openai_compatible", "anthropic"]


class ModelOption(BaseModel):
    """A model variant under a preset."""

    name: str = Field(..., description="模型 ID (调 LLM 时透传)")
    label: str = Field(..., description="UI 展示文本，可含延迟/容量提示")
    context_window: int | None = Field(default=None, description="ctx 长度 token")


class LLMPreset(BaseModel):
    """A named preset bundling provider type + base URL + recommended models."""

    id: str = Field(..., description="稳定 ID，前端用它判断 active")
    label: str
    provider_type: ProviderType
    base_url: str
    requires_api_key: bool
    hint: str = Field(..., description="UI tooltip / 卡片下方说明")
    models: list[ModelOption]
    default_model: str = Field(..., description="点击预设时预填的默认 model_name")


# ─── 预设清单（单一真理源）───────────────────────────────
#
# 注意:
# - Ollama 默认模型为 qwen3:8b（用户决定，~14.5s/req on RTX 3060 实测）
# - qwen3 全系列默认 thinking-mode 已在 OllamaProvider 端关闭
#   (commit 11486fb · patterns::pattern-ollama-disable-thinking-mode)
# - 模型 label 标注实测延迟便于用户权衡速度 vs 准确度
PRESETS: list[LLMPreset] = [
    LLMPreset(
        id="ollama",
        label="Ollama (本地)",
        provider_type="ollama",
        base_url="http://localhost:11434",
        requires_api_key=False,
        hint="完全本地，零 API Key。需先 ollama pull <model>。思考模式默认关闭以确保 JSON 输出可解析。Docker 部署时请改用 http://host.docker.internal:11434。",
        models=[
            ModelOption(name="qwen3:8b",      label="Qwen3 8B (默认 · ~14.5s/req)",   context_window=4096),
            ModelOption(name="qwen3:1.7b",    label="Qwen3 1.7B (基线 ✅ · ~2.3s)",  context_window=4096),
            ModelOption(name="qwen3.5:4b",    label="Qwen3.5 4B (~3.5s)",            context_window=4096),
            ModelOption(name="qwen3:4b",      label="Qwen3 4B (~4.3s)",              context_window=4096),
            ModelOption(name="llama3.1:8b",   label="Llama3.1 8B",                   context_window=8192),
        ],
        default_model="qwen3:8b",
    ),
    LLMPreset(
        id="moonshot",
        label="Moonshot (Kimi)",
        provider_type="openai_compatible",
        base_url="https://api.moonshot.cn/v1",
        requires_api_key=True,
        hint="OpenAI 兼容；从 https://platform.moonshot.cn 获取 sk-* key。",
        models=[
            ModelOption(name="moonshot-v1-8k",   label="v1 8K (便宜)",     context_window=8192),
            ModelOption(name="moonshot-v1-32k",  label="v1 32K (推荐)",    context_window=32768),
            ModelOption(name="moonshot-v1-128k", label="v1 128K (长文档)", context_window=131072),
        ],
        default_model="moonshot-v1-32k",
    ),
    LLMPreset(
        id="deepseek",
        label="DeepSeek",
        provider_type="openai_compatible",
        base_url="https://api.deepseek.com/v1",
        requires_api_key=True,
        hint="OpenAI 兼容；从 https://platform.deepseek.com 获取 sk-* key。",
        models=[
            ModelOption(name="deepseek-chat",     label="Chat (通用对话)",       context_window=65536),
            ModelOption(name="deepseek-reasoner", label="Reasoner (深度推理)",   context_window=65536),
        ],
        default_model="deepseek-chat",
    ),
    LLMPreset(
        id="anthropic",
        label="Anthropic Claude",
        provider_type="anthropic",
        base_url="https://api.anthropic.com",
        requires_api_key=True,
        hint="原生 /v1/messages 协议（非 OpenAI 兼容）；从 https://console.anthropic.com 获取 sk-ant-* key。",
        models=[
            ModelOption(name="claude-sonnet-4-5",         label="Sonnet 4.5 (推荐 · 性价比)",  context_window=200000),
            ModelOption(name="claude-opus-4-5",           label="Opus 4.5 (旗舰 · 复杂推理)",  context_window=200000),
            ModelOption(name="claude-haiku-4-5",          label="Haiku 4.5 (轻量 · 快速)",     context_window=200000),
            ModelOption(name="claude-3-5-sonnet-20241022", label="3.5 Sonnet (兼容旧版)",      context_window=200000),
            ModelOption(name="claude-3-5-haiku-20241022",  label="3.5 Haiku (兼容旧版)",       context_window=200000),
        ],
        default_model="claude-sonnet-4-5",
    ),
]


def find_active_preset_id(provider_type: str, base_url: str) -> str | None:
    """根据当前生效的 (provider_type, base_url) 反查匹配的 preset id。

    base_url 末尾 / 差异忽略 (canonicalize)。无匹配时返回 None（即"自定义"）。
    """
    canon = (base_url or "").rstrip("/")
    for p in PRESETS:
        if p.provider_type == provider_type and p.base_url.rstrip("/") == canon:
            return p.id
    return None


def derive_recommended_models() -> dict[str, list[str]]:
    """从 PRESETS 派生 /api/config/models 的扁平 {provider_type: [model_name,...]} 字典。

    保持 GET /api/config/models 的契约不变，避免破坏现有前端 datalist。
    顺序与 PRESETS 中模型顺序一致（即默认模型排在第一）。
    """
    out: dict[str, list[str]] = {"ollama": [], "openai_compatible": [], "anthropic": []}
    for p in PRESETS:
        for m in p.models:
            if m.name not in out[p.provider_type]:
                out[p.provider_type].append(m.name)
    return out
