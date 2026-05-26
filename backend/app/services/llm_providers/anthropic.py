# backend/app/services/llm_providers/anthropic.py
"""Anthropic Claude provider (native /v1/messages protocol).

§8.14 方案 B 落地: Anthropic Messages API 跟 OpenAI Chat Completions 不字节级兼容
（system 字段独立 + content 是 list[ContentBlock] + stream 用 context manager），
所以独立实装一个 provider，而不是复用 OpenAICompatibleProvider。

关键转换:
  OpenAI 风格  [{role: 'system', content: '...'}, {role: 'user', content: '...'}]
       ↓ _split_system
  Anthropic   system='...'  +  messages=[{role: 'user', content: '...'}]
"""

from __future__ import annotations

from typing import AsyncIterator

import anthropic

from app.services.llm_providers.base import BaseLLMProvider


def _split_system(messages: list[dict]) -> tuple[str | None, list[dict]]:
    """OpenAI 风格 messages → Anthropic 的 (system, messages).

    多条 system message 拼接为一段（用 \n\n 分隔），与 Anthropic 官方建议一致。
    非 system 的 message 透传保持顺序。
    """
    system_parts: list[str] = []
    msgs: list[dict] = []
    for m in messages:
        if m.get("role") == "system":
            content = m.get("content", "")
            if isinstance(content, str) and content:
                system_parts.append(content)
        else:
            msgs.append(m)
    system = "\n\n".join(system_parts) if system_parts else None
    return system, msgs


def _extract_text(content_blocks) -> str:
    """从 Anthropic Message.content 取首块 text（忽略 tool_use 等其他 block）.

    实际响应 content 是 list[ContentBlock]；TextBlock 有 .text 属性。
    若全为非文本块（极少见），返回空串避免 AttributeError。
    """
    if not content_blocks:
        return ""
    for block in content_blocks:
        text = getattr(block, "text", None)
        if isinstance(text, str):
            return text
    return ""


class AnthropicProvider(BaseLLMProvider):
    """Provider for Anthropic Claude via native /v1/messages protocol."""

    def __init__(self, api_key: str, base_url: str | None = None):
        kwargs: dict = {"api_key": api_key}
        # base_url 为空字符串时不传，让 SDK 用默认 https://api.anthropic.com
        if base_url:
            kwargs["base_url"] = base_url
        self.client = anthropic.AsyncAnthropic(**kwargs)

    async def chat(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.5,
        max_tokens: int = 4096,
        stream: bool = False,
    ) -> str | AsyncIterator[str]:
        system, msgs = _split_system(messages)
        params: dict = {
            "model": model,
            "messages": msgs,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if system is not None:
            params["system"] = system

        if stream:
            return self._stream_chat(params)

        resp = await self.client.messages.create(**params)
        return _extract_text(resp.content)

    async def _stream_chat(self, params: dict) -> AsyncIterator[str]:
        # Anthropic 的 stream 必须用 async context manager；text_stream 已是
        # 字符串增量（与 OpenAI choices[0].delta.content 一一对应）。
        async with self.client.messages.stream(**params) as s:
            async for chunk in s.text_stream:
                if chunk:
                    yield chunk
