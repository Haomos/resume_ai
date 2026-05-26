"""Integration tests for POST /api/jobs/extract — LLM 抽取 JD 字段.

mock build_llm_provider 避免真实 LLM 调用；覆盖正常 / 代码块剥离 / null 容忍 /
LLM 不可用 / 非 JSON 返回 / 输入太短 等 6 种路径。
"""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


def _mock_provider_returning(text: str):
    """构造一个 mock provider，其 chat() 返回 ``text``."""
    provider = AsyncMock()
    provider.chat = AsyncMock(return_value=text)
    return provider


@pytest.mark.asyncio
async def test_extract_returns_parsed_fields(client: AsyncClient):
    """正常路径: LLM 返回标准 JSON，端点解析后回包 5 个字段."""
    fake_resp = (
        '{"position":"Python 后端开发工程师","company":"字节跳动",'
        '"salary_min":25000,"salary_max":50000,"location":"北京"}'
    )
    with patch("app.routers.jobs.build_llm_provider") as mock_build:
        mock_build.return_value = (_mock_provider_returning(fake_resp), "qwen3:8b", 0.5)
        resp = await client.post(
            "/api/jobs/extract",
            json={"raw_text": "字节跳动 招聘 Python 后端开发工程师 20-50K 北京朝阳区"},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["position"] == "Python 后端开发工程师"
    assert data["company"] == "字节跳动"
    assert data["salary_min"] == 25000
    assert data["salary_max"] == 50000
    assert data["location"] == "北京"
    assert data["model"] == "qwen3:8b"
    assert data["error"] is None


@pytest.mark.asyncio
async def test_extract_strips_markdown_code_fences(client: AsyncClient):
    """LLM 偶尔会用 ```json ... ``` 包裹，端点必须自动剥掉再解析."""
    fake_resp = (
        '```json\n'
        '{"position":"Java","company":null,"salary_min":null,"salary_max":null,"location":null}\n'
        '```'
    )
    with patch("app.routers.jobs.build_llm_provider") as mock_build:
        mock_build.return_value = (_mock_provider_returning(fake_resp), "moonshot-v1-32k", 0.5)
        resp = await client.post(
            "/api/jobs/extract", json={"raw_text": "Java 工程师 北京"}
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is True
    assert data["position"] == "Java"
    assert data["company"] is None  # null 字段保持 None，前端不会去覆盖用户已填值


@pytest.mark.asyncio
async def test_extract_normalizes_string_null_to_none(client: AsyncClient):
    """LLM 偶尔会返回字符串 'null' / 空串而非 JSON null，统一规范化为 None."""
    fake_resp = (
        '{"position":"Python","company":"null","salary_min":"","salary_max":null,"location":"None"}'
    )
    with patch("app.routers.jobs.build_llm_provider") as mock_build:
        mock_build.return_value = (_mock_provider_returning(fake_resp), "qwen3:8b", 0.5)
        resp = await client.post(
            "/api/jobs/extract", json={"raw_text": "Python 工程师 招聘"}
        )

    data = resp.json()
    assert data["ok"] is True
    assert data["position"] == "Python"
    assert data["company"] is None    # 字符串 "null" → None
    assert data["salary_min"] is None # 空字符串 → None
    assert data["salary_max"] is None
    assert data["location"] is None   # 字符串 "None" → None


@pytest.mark.asyncio
async def test_extract_llm_unavailable_returns_ok_false(client: AsyncClient):
    """LLM 没配置 / build_provider 抛错 → 200 + ok=False（不抛 5xx）."""
    with patch("app.routers.jobs.build_llm_provider") as mock_build:
        mock_build.side_effect = ValueError("Unknown provider_type: foobar")
        resp = await client.post(
            "/api/jobs/extract", json={"raw_text": "Python 工程师 北京"}
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert data["error"] is not None
    assert "LLM 未配置" in data["error"]
    # build 失败时拿不到 model 名，model 字段为 None
    assert data["model"] is None


@pytest.mark.asyncio
async def test_extract_llm_returns_non_json_returns_ok_false(client: AsyncClient):
    """LLM 返回非 JSON 文本（"对不起我不知道"）→ 200 + ok=False + 解析错误描述."""
    with patch("app.routers.jobs.build_llm_provider") as mock_build:
        mock_build.return_value = (
            _mock_provider_returning("抱歉我无法识别这段文本，请人工填写。"),
            "qwen3:8b",
            0.5,
        )
        resp = await client.post(
            "/api/jobs/extract", json={"raw_text": "Python 工程师 北京"}
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["ok"] is False
    assert data["error"] is not None
    assert "非 JSON" in data["error"]
    # 失败时 model 字段仍要回填，便于前端调试显示
    assert data["model"] == "qwen3:8b"


@pytest.mark.asyncio
async def test_extract_llm_call_exception_returns_ok_false(client: AsyncClient):
    """LLM provider.chat() 抛异常（网络错误 / 401）→ 200 + ok=False + 异常类型名."""
    with patch("app.routers.jobs.build_llm_provider") as mock_build:
        provider = AsyncMock()
        provider.chat = AsyncMock(side_effect=ConnectionError("connection refused"))
        mock_build.return_value = (provider, "qwen3:8b", 0.5)
        resp = await client.post(
            "/api/jobs/extract", json={"raw_text": "Python 工程师 北京"}
        )

    data = resp.json()
    assert data["ok"] is False
    assert "LLM 调用失败" in data["error"]
    assert "ConnectionError" in data["error"]


@pytest.mark.asyncio
async def test_extract_input_too_short_422(client: AsyncClient):
    """raw_text < 10 字符 → schema 验证失败 → 422（避免对显然没用的输入浪费 LLM tokens）."""
    resp = await client.post("/api/jobs/extract", json={"raw_text": "短"})
    assert resp.status_code == 422
