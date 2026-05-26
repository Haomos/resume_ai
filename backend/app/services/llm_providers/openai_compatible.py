# backend/app/services/llm_providers/openai_compatible.py
"""OpenAI-Compatible provider (Kimi, DeepSeek, OpenAI, etc.)."""

import os
from typing import AsyncIterator

import openai

from app.services.llm_providers.base import BaseLLMProvider


class OpenAICompatibleProvider(BaseLLMProvider):
    """Provider for any OpenAI-compatible endpoint (Kimi, DeepSeek, SiliconFlow, Azure)."""

    def __init__(self, api_key: str, base_url: str | None = None):
        self.client = openai.AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def chat(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.5,
        max_tokens: int = 4096,
        stream: bool = False,
    ) -> str | AsyncIterator[str]:
        if stream:
            return self._stream_chat(messages, model, temperature, max_tokens)

        resp = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=False,
        )
        return resp.choices[0].message.content or ""

    async def _stream_chat(
        self, messages: list[dict], model: str, temperature: float, max_tokens: int
    ) -> AsyncIterator[str]:
        stream = await self.client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            content = chunk.choices[0].delta.content
            if content:
                yield content