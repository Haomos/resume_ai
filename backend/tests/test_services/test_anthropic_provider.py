"""Unit tests for AnthropicProvider helpers (no network).

§8.14 方案 B 落地的回归保障：
- _split_system 必须把 OpenAI 风格的 system message 拆成独立字段
- _extract_text 必须从 Anthropic content blocks 取首块 text
- AnthropicProvider 构造时不传 base_url 走 SDK 默认；传了就透传
"""

from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.services.llm_providers.anthropic import (
    AnthropicProvider,
    _extract_text,
    _split_system,
)


# ─── _split_system ────────────────────────────────────────────────


def test_split_system_no_system_message():
    msgs = [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi"},
    ]
    system, out = _split_system(msgs)
    assert system is None
    assert out == msgs


def test_split_system_single_system_message():
    msgs = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "hello"},
    ]
    system, out = _split_system(msgs)
    assert system == "You are a helpful assistant."
    assert out == [{"role": "user", "content": "hello"}]


def test_split_system_multiple_system_messages_join_with_double_newline():
    msgs = [
        {"role": "system", "content": "Persona: senior reviewer."},
        {"role": "system", "content": "Tone: concise."},
        {"role": "user", "content": "hi"},
    ]
    system, out = _split_system(msgs)
    assert system == "Persona: senior reviewer.\n\nTone: concise."
    assert out == [{"role": "user", "content": "hi"}]


def test_split_system_empty_system_content_skipped():
    msgs = [
        {"role": "system", "content": ""},
        {"role": "user", "content": "hi"},
    ]
    system, out = _split_system(msgs)
    # 全是空串 → 当作没有 system
    assert system is None
    assert out == [{"role": "user", "content": "hi"}]


def test_split_system_preserves_non_system_order():
    msgs = [
        {"role": "user", "content": "Q1"},
        {"role": "system", "content": "rule"},
        {"role": "assistant", "content": "A1"},
        {"role": "user", "content": "Q2"},
    ]
    system, out = _split_system(msgs)
    assert system == "rule"
    assert [m["role"] for m in out] == ["user", "assistant", "user"]
    assert [m["content"] for m in out] == ["Q1", "A1", "Q2"]


# ─── _extract_text ────────────────────────────────────────────────


def test_extract_text_empty_returns_empty_string():
    assert _extract_text([]) == ""
    assert _extract_text(None) == ""


def test_extract_text_single_text_block():
    blocks = [SimpleNamespace(text="hello world")]
    assert _extract_text(blocks) == "hello world"


def test_extract_text_skips_non_text_blocks():
    """tool_use / image block 没 .text 属性，应跳到下一块."""
    blocks = [
        SimpleNamespace(type="tool_use", id="x"),  # no .text
        SimpleNamespace(text="actual answer"),
    ]
    assert _extract_text(blocks) == "actual answer"


def test_extract_text_returns_first_text_block_only():
    blocks = [
        SimpleNamespace(text="first"),
        SimpleNamespace(text="second"),
    ]
    assert _extract_text(blocks) == "first"


# ─── AnthropicProvider construction ────────────────────────────────
#
# 注意：anthropic SDK 自己读 ``ANTHROPIC_BASE_URL`` 环境变量（用户系统里
# 可能设了 Ruflo / Kimi-for-coding 代理 — 见 MEMORY/AGENTS.md），所以不能
# 直接断言 ``client.base_url`` 等于某个固定值。这里只断言 *我们 provider
# 自己向 SDK 传了什么 kwargs* —— SDK 默认值 / env override 是 SDK 自己的合约。


def test_provider_init_omits_base_url_when_none():
    """base_url=None → 我们不传 base_url 给 SDK，让 SDK 走自己的默认/env 解析。"""
    with patch("app.services.llm_providers.anthropic.anthropic.AsyncAnthropic") as Mock:
        AnthropicProvider(api_key="sk-ant-test")
        Mock.assert_called_once_with(api_key="sk-ant-test")


def test_provider_init_omits_base_url_when_empty_string():
    """空串 base_url 等价于不传，避免 SDK 拼出 'https:///v1/messages' 这种坏 URL。"""
    with patch("app.services.llm_providers.anthropic.anthropic.AsyncAnthropic") as Mock:
        AnthropicProvider(api_key="sk-ant-test", base_url="")
        Mock.assert_called_once_with(api_key="sk-ant-test")


def test_provider_init_passes_base_url_when_provided():
    """有 base_url（自托管 / 代理）→ 透传给 SDK。"""
    with patch("app.services.llm_providers.anthropic.anthropic.AsyncAnthropic") as Mock:
        AnthropicProvider(api_key="sk-ant-test", base_url="https://my.proxy/v1")
        Mock.assert_called_once_with(
            api_key="sk-ant-test", base_url="https://my.proxy/v1"
        )
