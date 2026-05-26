"""Integration tests for /api/config/* — Phase 4 model preset switching."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_presets_returns_four(client: AsyncClient):
    """GET /api/config/presets returns 4 presets with required fields (Ollama / Moonshot / DeepSeek / Anthropic)."""
    resp = await client.get("/api/config/presets")
    assert resp.status_code == 200
    data = resp.json()
    assert "presets" in data and "active_preset_id" in data

    presets = data["presets"]
    assert len(presets) == 4
    ids = {p["id"] for p in presets}
    assert ids == {"ollama", "moonshot", "deepseek", "anthropic"}

    # Each preset must declare core fields
    for p in presets:
        assert {"id", "label", "provider_type", "base_url",
                "requires_api_key", "hint", "models", "default_model"} <= set(p.keys())
        assert len(p["models"]) >= 1
        assert any(m["name"] == p["default_model"] for m in p["models"])


@pytest.mark.asyncio
async def test_ollama_preset_default_model_is_qwen3_8b(client: AsyncClient):
    """User-decided: Ollama default = qwen3:8b (thinking-mode disabled by provider)."""
    resp = await client.get("/api/config/presets")
    presets = resp.json()["presets"]
    ollama = next(p for p in presets if p["id"] == "ollama")
    assert ollama["default_model"] == "qwen3:8b"
    assert ollama["requires_api_key"] is False


@pytest.mark.asyncio
async def test_anthropic_preset_default_model_and_provider_type(client: AsyncClient):
    """§8.14 方案 B: Anthropic preset 注册 + provider_type='anthropic' + default=claude-sonnet-4-5."""
    resp = await client.get("/api/config/presets")
    presets = resp.json()["presets"]
    anthropic = next(p for p in presets if p["id"] == "anthropic")
    assert anthropic["provider_type"] == "anthropic"
    assert anthropic["default_model"] == "claude-sonnet-4-5"
    assert anthropic["requires_api_key"] is True
    # base_url 不带 /v1，让 SDK 自己拼 /v1/messages
    assert anthropic["base_url"] == "https://api.anthropic.com"
    # 同时收录 4.x 系列 + 3.5 兼容版
    model_names = {m["name"] for m in anthropic["models"]}
    assert "claude-sonnet-4-5" in model_names
    assert "claude-3-5-sonnet-20241022" in model_names


@pytest.mark.asyncio
async def test_get_models_derives_from_presets(client: AsyncClient):
    """GET /api/config/models must surface the same model set as /presets (single source of truth).

    §8.14 方案 B 后多了 anthropic 键；用 dict-based 拼装替代原来的 if/else，
    避免新加 provider_type 时再次踩"未列入分支被错归类"的坑。
    """
    presets_resp = await client.get("/api/config/presets")
    models_resp = await client.get("/api/config/models")
    assert models_resp.status_code == 200

    flat = models_resp.json()["models"]
    expected: dict[str, list[str]] = {"ollama": [], "openai_compatible": [], "anthropic": []}
    for p in presets_resp.json()["presets"]:
        target = expected[p["provider_type"]]
        for m in p["models"]:
            if m["name"] not in target:
                target.append(m["name"])

    assert flat == expected
    # providers list 也要同步暴露 anthropic
    assert set(models_resp.json()["providers"]) == {"ollama", "openai_compatible", "anthropic"}


@pytest.mark.asyncio
async def test_apply_moonshot_preset_persists_and_active(client: AsyncClient):
    """PUT /api/config/llm with Moonshot preset values → GET /presets reports active_preset_id='moonshot'."""
    patch = {
        "provider_type": "openai_compatible",
        "base_url": "https://api.moonshot.cn/v1",
        "model_name": "moonshot-v1-32k",
        "temperature": 0.5,
    }
    put = await client.put("/api/config/llm", json=patch)
    assert put.status_code == 200

    presets = await client.get("/api/config/presets")
    assert presets.json()["active_preset_id"] == "moonshot"


@pytest.mark.asyncio
async def test_custom_base_url_yields_no_active_preset(client: AsyncClient):
    """Free-edit case: user points at a self-hosted vLLM → active_preset_id is None ('自定义')."""
    patch = {
        "provider_type": "openai_compatible",
        "base_url": "http://my-vllm.local:8000/v1",
        "model_name": "Qwen2.5-72B-Instruct",
    }
    put = await client.put("/api/config/llm", json=patch)
    assert put.status_code == 200

    presets = await client.get("/api/config/presets")
    assert presets.json()["active_preset_id"] is None


@pytest.mark.asyncio
async def test_test_connection_unreachable_returns_ok_false(client: AsyncClient):
    """POST /api/config/test must NOT raise 5xx — failures normalized to ok=False+error.

    We point at a deliberately unreachable Ollama port and expect the route to swallow the
    httpx.ConnectError and return 200 + ok=False so the FE renders a single error card.
    """
    await client.put(
        "/api/config/llm",
        json={
            "provider_type": "ollama",
            "base_url": "http://127.0.0.1:1",  # nothing listens on TCP/1
            "model_name": "qwen3:8b",
        },
    )
    resp = await client.post("/api/config/test")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is False
    assert body["error"] is not None
    assert body["model"] == "qwen3:8b"


@pytest.mark.asyncio
async def test_apply_anthropic_preset_persists_and_active(client: AsyncClient):
    """§8.14 方案 B: PUT anthropic preset → /presets reports active_preset_id='anthropic'."""
    patch = {
        "provider_type": "anthropic",
        "base_url": "https://api.anthropic.com",
        "model_name": "claude-sonnet-4-5",
        "temperature": 0.3,
    }
    put = await client.put("/api/config/llm", json=patch)
    assert put.status_code == 200, put.text
    assert put.json()["provider_type"] == "anthropic"

    presets = await client.get("/api/config/presets")
    assert presets.json()["active_preset_id"] == "anthropic"


@pytest.mark.asyncio
async def test_anthropic_test_connection_unreachable_returns_ok_false(client: AsyncClient):
    """§8.14 方案 B: anthropic provider 也走 test 路由。

    底层 ConnectError 必须归一化为 ok=False+error 而不是 500，
    与 ollama 端的 test_test_connection_unreachable_returns_ok_false 保持同等行为。
    """
    await client.put(
        "/api/config/llm",
        json={
            "provider_type": "anthropic",
            "base_url": "http://127.0.0.1:1",  # nothing listens
            "api_key": "sk-ant-fake-key-for-routing-smoke",
            "model_name": "claude-sonnet-4-5",
        },
    )
    resp = await client.post("/api/config/test")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is False
    assert body["error"] is not None
    assert body["model"] == "claude-sonnet-4-5"


# ─── Phase 4 — 自定义预设槽位 + Bug 1b ──────────────────────────

@pytest.mark.asyncio
async def test_custom_presets_crud(client: AsyncClient):
    """PUT /custom-presets → GET /custom-presets 往返；上限3个自动截断。"""
    # 初始为空
    get0 = await client.get("/api/config/custom-presets")
    assert get0.status_code == 200
    assert get0.json()["presets"] == []
    assert get0.json()["max_slots"] == 3

    # 保存2个
    payload = [
        {"id": "c1", "name": "本地测试", "provider_type": "ollama", "base_url": "http://localhost:11434", "model_name": "qwen3:8b", "temperature": 0.5},
        {"id": "c2", "name": "工作Kimi", "provider_type": "openai_compatible", "base_url": "https://api.moonshot.cn/v1", "model_name": "moonshot-v1-32k", "temperature": 0.3},
    ]
    put = await client.put("/api/config/custom-presets", json=payload)
    assert put.status_code == 200
    assert len(put.json()["presets"]) == 2

    # GET 验证
    get1 = await client.get("/api/config/custom-presets")
    assert get1.json()["presets"][0]["name"] == "本地测试"
    assert get1.json()["presets"][1]["model_name"] == "moonshot-v1-32k"

    # 超限3个 → 自动截断为前3
    payload4 = payload + [
        {"id": "c3", "name": "DS", "provider_type": "openai_compatible", "base_url": "https://api.deepseek.com/v1", "model_name": "deepseek-chat", "temperature": 0.5},
        {"id": "c4", "name": "多余", "provider_type": "anthropic", "base_url": "https://api.anthropic.com", "model_name": "claude-sonnet-4-5", "temperature": 0.5},
    ]
    put4 = await client.put("/api/config/custom-presets", json=payload4)
    assert len(put4.json()["presets"]) == 3
    ids = {p["id"] for p in put4.json()["presets"]}
    assert "c4" not in ids


@pytest.mark.asyncio
async def test_test_connection_with_body_uses_temp_config(client: AsyncClient):
    """Bug 1b: POST /test with body 使用 body 值临时测试，不依赖已保存配置。"""
    # 先保存一个 moonshot 配置到 DB
    await client.put(
        "/api/config/llm",
        json={
            "provider_type": "openai_compatible",
            "base_url": "https://api.moonshot.cn/v1",
            "model_name": "moonshot-v1-32k",
        },
    )

    # 用 body 传一个未保存的 ollama 配置去测试（端口故意不可达）
    resp = await client.post(
        "/api/config/test",
        json={
            "provider_type": "ollama",
            "base_url": "http://127.0.0.1:1",
            "model_name": "qwen3:8b",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # 应该用的是 body 里的 ollama 配置，而不是 DB 里的 moonshot
    assert body["model"] == "qwen3:8b"
    assert body["ok"] is False
    assert "ConnectError" in body["error"] or "connection" in body["error"].lower() or body["error"] is not None


@pytest.mark.asyncio
async def test_test_connection_without_body_uses_saved_config(client: AsyncClient):
    """Bug 1b 回归: 无 body 时仍用 DB 已存配置（当前行为不变）。"""
    await client.put(
        "/api/config/llm",
        json={
            "provider_type": "ollama",
            "base_url": "http://127.0.0.1:1",
            "model_name": "qwen3:8b",
        },
    )
    resp = await client.post("/api/config/test")
    assert resp.status_code == 200
    assert resp.json()["model"] == "qwen3:8b"
    assert resp.json()["ok"] is False
