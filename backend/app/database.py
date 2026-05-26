# backend/app/database.py
"""SQLAlchemy 2.0 async database configuration."""

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import get_config

config = get_config()

# Async engine for FastAPI
async_engine = create_async_engine(
    config.database.url,
    echo=config.database.echo,
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)

# Sync engine for background tasks (if needed)
sync_engine = create_engine(
    config.database.url.replace("+aiosqlite", ""),
    echo=config.database.echo,
    future=True,
)

SessionLocal = sessionmaker(bind=sync_engine, autoflush=False, autocommit=False)

Base = declarative_base()


async def get_db():
    """FastAPI dependency: yield async DB session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()