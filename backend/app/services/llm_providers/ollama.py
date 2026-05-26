# backend/app/services/llm_providers/ollama.py
"""Ollama local LLM provider."""

import json
from typing import AsyncIterator

import httpx

from app.services.llm_providers.base import BaseLLMProvider


class OllamaProvider(BaseLLMProvider):
    """Provider for Ollama local models via HTTP API.

    Thinking-mode handling
    ----------------------
    Modern Qwen3 / Qwen3.5 models (and other reasoning-style models served
    via Ollama) default to a *thinking* mode where the chain-of-thought is
    placed in ``message.thinking`` and the visible ``message.content`` is
    empty. Downstream callers (``analyzer.analyze_one``) expect a JSON
    string in ``content``, so we ship ``think: false`` in the payload by
    default to force the model to emit the answer directly.

    Set ``enable_thinking=True`` if you actually want the raw CoT (e.g.
    debugging or building a UI that surfaces it separately).
    """

    def __init__(
        self,
        base_url: str = "http://localhost:11434",
        *,
        enable_thinking: bool = False,
    ):
        self.base_url = base_url.rstrip("/")
        self.enable_thinking = enable_thinking
        self.client = httpx.AsyncClient(timeout=120.0)

    def _build_payload(
        self,
        messages: list[dict],
        model: str,
        temperature: float,
        max_tokens: int,
        stream: bool,
    ) -> dict:
        payload: dict = {
            "model": model,
            "messages": messages,
            "options": {"temperature": temperature, "num_predict": max_tokens},
            "stream": stream,
        }
        # Ollama treats ``think: false`` as "skip the <think> phase and emit
        # the final answer directly into ``message.content``". Models that
        # don't support thinking simply ignore the field, so it's safe to
        # always send when ``enable_thinking`` is False.
        if not self.enable_thinking:
            payload["think"] = False
        return payload

    async def chat(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.5,
        max_tokens: int = 4096,
        stream: bool = False,
    ) -> str | AsyncIterator[str]:
        payload = self._build_payload(messages, model, temperature, max_tokens, stream)
        if stream:
            return self._stream_chat(payload)

        resp = await self.client.post(f"{self.base_url}/api/chat", json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data.get("message", {}).get("content", "")

    async def _stream_chat(self, payload: dict) -> AsyncIterator[str]:
        async with self.client.stream("POST", f"{self.base_url}/api/chat", json=payload) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line:
                    continue
                try:
                    data = json.loads(line)
                    chunk = data.get("message", {}).get("content", "")
                    if chunk:
                        yield chunk
                except json.JSONDecodeError:
                    continue