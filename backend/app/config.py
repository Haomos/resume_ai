# backend/app/config.py
"""Application configuration with environment-based overrides."""

from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class DatabaseConfig(BaseSettings):
    """SQLite database configuration."""
    model_config = SettingsConfigDict(env_prefix="DB_", env_file=".env", extra="ignore")
    url: str = Field(default="sqlite+aiosqlite:///data/resume_assistant.db")
    echo: bool = Field(default=False)


class LLMConfig(BaseSettings):
    """LLM provider configuration (Ollama / OpenAI-Compatible)."""
    model_config = SettingsConfigDict(env_prefix="LLM_", env_file=".env", extra="ignore")
    provider_type: Literal["ollama", "openai_compatible", "anthropic"] = Field(default="openai_compatible")
    base_url: str = Field(default="https://api.moonshot.cn/v1")
    api_key: Optional[str] = Field(default=None)
    model_name: str = Field(default="moonshot-v1-32k")
    temperature: float = Field(default=0.5, ge=0.0, le=2.0)


class EmbeddingConfig(BaseSettings):
    """Local HuggingFace embedding configuration."""
    model_config = SettingsConfigDict(env_prefix="EMBEDDING_", env_file=".env", extra="ignore")
    model_name: str = Field(default="BAAI/bge-m3")
    device: str = Field(default="auto")
    normalize: bool = Field(default=True)


class OcrConfig(BaseSettings):
    """Image OCR configuration. Disabled by default to avoid heavy model deps."""
    model_config = SettingsConfigDict(env_prefix="OCR_", env_file=".env", extra="ignore")
    enabled: bool = Field(default=False)
    engine: Literal["paddle", "easy"] = Field(default="paddle")
    # paddle: 'ch' = Chinese+English mixed; easy: comma-separated codes (e.g. 'ch_sim,en')
    lang: str = Field(default="ch")


class AppConfig(BaseSettings):
    """Main application configuration aggregating all sub-configs."""
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    app_name: str = Field(default="ResumeAI")
    secret_key: str = Field(default="change-me-in-production")
    upload_dir: Path = Field(default=Path("./data/uploads"))
    max_file_size: int = Field(default=20 * 1024 * 1024)  # 20MB
    allowed_extensions: list[str] = Field(default=["pdf", "docx", "html", "txt", "png", "jpg"])
    # Recruiter batch scoring concurrency limit (Semaphore size in _run_batch).
    # Tune down if LLM provider rate-limits or up if you have spare throughput.
    batch_concurrency: int = Field(default=5, ge=1, le=50)
    database: DatabaseConfig = Field(default_factory=DatabaseConfig)
    llm: LLMConfig = Field(default_factory=LLMConfig)
    embedding: EmbeddingConfig = Field(default_factory=EmbeddingConfig)
    ocr: OcrConfig = Field(default_factory=OcrConfig)


@lru_cache
def get_config() -> AppConfig:
    return AppConfig()
