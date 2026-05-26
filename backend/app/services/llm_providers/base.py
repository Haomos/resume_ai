# backend/app/services/llm_providers/base.py
"""Abstract base class for LLM providers."""

from abc import ABC, abstractmethod
from typing import AsyncIterator


class BaseLLMProvider(ABC):
    """Unified interface for all LLM backends (Ollama, OpenAI-Compatible)."""

    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.5,
        max_tokens: int = 4096,
        stream: bool = False,
    ) -> str | AsyncIterator[str]:
        """Send chat completion request."""
        ...
