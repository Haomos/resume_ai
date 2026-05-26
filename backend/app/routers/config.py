# backend/app/routers/config.py
"""System configuration router (BYOK — per-user LLM config)."""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_config
from app.database import get_db
from app.models.system_config import SystemConfig
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.config import (
    CustomPreset,
    CustomPresetsResponse,
    LLMConfigResponse,
    LLMConfigUpdate,
    PresetsResponse,
    RecommendedModelsResponse,
    TestConnectionResponse,
)
from app.services.llm_factory import build_llm_provider
from app.services.llm_presets import (
    PRESETS,
    derive_recommended_models,
    find_active_preset_id,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/config", tags=["config"])
config = get_config()

LLM_KEYS = {
    "provider_type": "llm.provider_type",
    "base_url": "llm.base_url",
    "api_key": "llm.api_key",
    "model_name": "llm.model_name",
    "temperature": "llm.temperature",
}
CUSTOM_PRESETS_KEY = "llm.custom_presets"


async def _read_llm_overrides(db: AsyncSession, user_id: int) -> dict[str, str]:
    stmt = select(SystemConfig).where(
        SystemConfig.user_id == user_id,
        SystemConfig.key.in_(list(LLM_KEYS.values()))
    )
    rows = (await db.execute(stmt)).scalars().all()
    inverted = {v: k for k, v in LLM_KEYS.items()}
    return {inverted[r.key]: r.value for r in rows if r.key in inverted}


async def _upsert(db: AsyncSession, user_id: int, key: str, value: str, encrypted: bool = False) -> None:
    """Atomic upsert via SQLite ON CONFLICT DO UPDATE.

    Avoids race-condition 500s that occur when two concurrent requests both
    see ``existing is None`` and then collide on commit.
    """
    stmt = (
        sqlite_insert(SystemConfig)
        .values(user_id=user_id, key=key, value=value, encrypted=encrypted)
        .on_conflict_do_update(
            index_elements=["user_id", "key"],
            set_={"value": value, "encrypted": encrypted},
        )
    )
    await db.execute(stmt)


import json as _json


async def _read_custom_presets(db: AsyncSession, user_id: int) -> list[CustomPreset]:
    row = (
        await db.execute(select(SystemConfig).where(SystemConfig.user_id == user_id, SystemConfig.key == CUSTOM_PRESETS_KEY))
    ).scalar_one_or_none()
    if not row or not row.value:
        return []
    try:
        data = _json.loads(row.value)
        if not isinstance(data, list):
            return []
        return [CustomPreset(**item) for item in data]
    except Exception:
        logger.warning("Failed to parse custom presets JSON; returning empty list")
        return []


async def _write_custom_presets(db: AsyncSession, user_id: int, presets: list[CustomPreset]) -> None:
    await _upsert(db, user_id, CUSTOM_PRESETS_KEY, _json.dumps([p.model_dump() for p in presets], ensure_ascii=False))


@router.get("/llm", response_model=LLMConfigResponse)
async def get_llm_config(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    overrides = await _read_llm_overrides(db, current_user.id)
    provider_type = overrides.get("provider_type", config.llm.provider_type)
    base_url = overrides.get("base_url", config.llm.base_url)
    model_name = overrides.get("model_name", config.llm.model_name)
    temperature_raw = overrides.get("temperature")
    try:
        temperature = float(temperature_raw) if temperature_raw is not None else config.llm.temperature
    except ValueError:
        temperature = config.llm.temperature
    has_api_key = bool(overrides.get("api_key")) or bool(config.llm.api_key)
    return LLMConfigResponse(
        provider_type=provider_type,
        base_url=base_url,
        model_name=model_name,
        temperature=temperature,
        has_api_key=has_api_key,
    )


@router.put("/llm", response_model=LLMConfigResponse)
async def update_llm_config(
    data: LLMConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if data.provider_type is not None:
        await _upsert(db, current_user.id, LLM_KEYS["provider_type"], data.provider_type)
    if data.base_url is not None:
        await _upsert(db, current_user.id, LLM_KEYS["base_url"], data.base_url)
    if data.api_key is not None:
        await _upsert(db, current_user.id, LLM_KEYS["api_key"], data.api_key, encrypted=True)
    if data.model_name is not None:
        await _upsert(db, current_user.id, LLM_KEYS["model_name"], data.model_name)
    if data.temperature is not None:
        await _upsert(db, current_user.id, LLM_KEYS["temperature"], str(data.temperature))
    await db.commit()
    return await get_llm_config(db, current_user)


@router.get("/models", response_model=RecommendedModelsResponse)
async def get_recommended_models():
    return RecommendedModelsResponse(
        providers=["ollama", "openai_compatible", "anthropic"],
        models=derive_recommended_models(),
    )


@router.get("/presets", response_model=PresetsResponse)
async def get_presets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    overrides = await _read_llm_overrides(db, current_user.id)
    provider_type = overrides.get("provider_type", config.llm.provider_type)
    base_url = overrides.get("base_url", config.llm.base_url)
    return PresetsResponse(
        presets=PRESETS,
        active_preset_id=find_active_preset_id(provider_type, base_url),
    )


@router.get("/custom-presets", response_model=CustomPresetsResponse)
async def get_custom_presets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    presets = await _read_custom_presets(db, current_user.id)
    return CustomPresetsResponse(presets=presets, max_slots=3)


@router.put("/custom-presets", response_model=CustomPresetsResponse)
async def update_custom_presets(
    data: list[CustomPreset],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    trimmed = data[:3]
    await _write_custom_presets(db, current_user.id, trimmed)
    await db.commit()
    return CustomPresetsResponse(presets=trimmed, max_slots=3)


@router.post("/test", response_model=TestConnectionResponse)
async def test_llm_connection(
    body: LLMConfigUpdate | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    forced: dict[str, str] | None = None
    if body:
        forced = {}
        if body.provider_type is not None:
            forced["provider_type"] = body.provider_type
        if body.base_url is not None:
            forced["base_url"] = body.base_url
        if body.api_key is not None:
            forced["api_key"] = body.api_key
        if body.model_name is not None:
            forced["model_name"] = body.model_name
        if body.temperature is not None:
            forced["temperature"] = str(body.temperature)
    try:
        provider, model_name, _ = await build_llm_provider(db, user_id=current_user.id, forced=forced)
    except Exception as e:
        logger.warning("test_llm_connection: failed to build provider: %s", e)
        return TestConnectionResponse(ok=False, error=f"build_provider: {str(e)[:160]}")
    try:
        raw = await provider.chat(
            messages=[{"role": "user", "content": "ping"}],
            model=model_name,
            temperature=0.0,
            max_tokens=5,
        )
        text = raw if isinstance(raw, str) else ""
        preview = text.strip()[:80] if text else "(empty response)"
        return TestConnectionResponse(ok=True, model=model_name, preview=preview)
    except Exception as e:
        msg = f"{type(e).__name__}: {str(e)[:180]}"
        logger.info("test_llm_connection: ping failed: %s", msg)
        return TestConnectionResponse(ok=False, model=model_name, error=msg)
