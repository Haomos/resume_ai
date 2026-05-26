"""LLM Provider factory: reads current effective config (SystemConfig overrides + env defaults) and constructs a BaseLLMProvider instance per call.

Phase 2a smoke 用; 后续可加缓存/连接池。
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_config
from app.models.system_config import SystemConfig
from app.services.llm_providers.anthropic import AnthropicProvider
from app.services.llm_providers.base import BaseLLMProvider
from app.services.llm_providers.ollama import OllamaProvider
from app.services.llm_providers.openai_compatible import OpenAICompatibleProvider

_app_config = get_config()

_LLM_KEYS = [
    "llm.provider_type",
    "llm.base_url",
    "llm.api_key",
    "llm.model_name",
    "llm.temperature",
]


async def _read_overrides(db: AsyncSession, user_id: int | None = None) -> dict[str, str]:
    stmt = select(SystemConfig).where(SystemConfig.key.in_(_LLM_KEYS))
    if user_id is not None:
        stmt = stmt.where(SystemConfig.user_id == user_id)
    rows = (await db.execute(stmt)).scalars().all()
    return {r.key.split(".", 1)[1]: r.value for r in rows}


async def build_llm_provider(
    db: AsyncSession,
    *,
    user_id: int | None = None,
    forced: dict[str, str] | None = None,
) -> tuple[BaseLLMProvider, str, float]:
    """Construct provider from effective config. Returns (provider, model_name, temperature).

    Args:
        user_id: 若提供，则读取该用户的 BYOK 配置。
        forced: 若提供，则这些字段优先于 DB / env 默认值。
    """
    overrides = await _read_overrides(db, user_id=user_id)

    provider_type = (forced.get("provider_type") if forced else None) or overrides.get("provider_type", _app_config.llm.provider_type)
    base_url = (forced.get("base_url") if forced else None) or overrides.get("base_url", _app_config.llm.base_url)
    api_key = (forced.get("api_key") if forced else None) or overrides.get("api_key", _app_config.llm.api_key) or ""
    model_name = (forced.get("model_name") if forced else None) or overrides.get("model_name", _app_config.llm.model_name)

    temp_raw = (forced.get("temperature") if forced else None) or overrides.get("temperature", _app_config.llm.temperature)
    try:
        temperature = float(temp_raw)
    except (TypeError, ValueError):
        temperature = float(_app_config.llm.temperature)

    if provider_type == "ollama":
        provider: BaseLLMProvider = OllamaProvider(base_url=base_url)
    elif provider_type == "openai_compatible":
        provider = OpenAICompatibleProvider(api_key=api_key or "ollama", base_url=base_url)
    elif provider_type == "anthropic":
        # base_url 为空时让 SDK 用默认 https://api.anthropic.com；
        # 自托管/代理场景下用户在 Settings 里填的 base_url 会透传。
        provider = AnthropicProvider(api_key=api_key, base_url=base_url or None)
    else:
        raise ValueError(f"Unknown provider_type: {provider_type}")

    return provider, model_name, temperature
