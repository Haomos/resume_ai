"""Pytest fixtures for backend tests.

测试隔离 (§后续修复，避免 pytest 污染生产 DB)
============================================
``app.database`` 在 module load 时就调 ``get_config()`` 并构造 ``async_engine``，
**所以必须在 import app.* 之前**把 ``DB_URL`` env 改成一个独立的临时 SQLite，
否则测试的 PUT /api/config/llm / POST /api/resumes/upload 会直接污染 prod
``data/resume_assistant.db``（曾踩坑：用户手动配的 LLM key/base_url 被
``test_anthropic_test_connection_unreachable_returns_ok_false`` 覆盖；
~50 条测试残留 resume 行混进真实简历表）。

本文件:
1. 顶部用 ``os.environ['DB_URL'] = sqlite+aiosqlite:///<tmp>`` 切到隔离 DB
2. ``setup_db`` session-scope autouse fixture 创建表 + 测试结束清理
3. 不再依赖任何 prod-side 配置
"""

import os
from pathlib import Path

# ─── 隔离 DB（必须在 import app 之前完成）────────────────────────
_TEST_DB_PATH = Path(__file__).parent / "_pytest_isolated.db"
# 预清理：上次测试的 DB 残留（比如上次跑到一半 Ctrl+C 了）
if _TEST_DB_PATH.exists():
    try:
        _TEST_DB_PATH.unlink()
    except OSError:
        pass  # Windows 下可能被占用，让 SQLAlchemy 自己重建/续用

# DatabaseConfig.env_prefix='DB_' → 字段 url 对应 env var DB_URL
os.environ["DB_URL"] = f"sqlite+aiosqlite:///{_TEST_DB_PATH.as_posix()}"

# 现在才能 import app —— 此时 get_config() / async_engine 都用上面的隔离 URL
import pytest_asyncio  # noqa: E402
from httpx import AsyncClient, ASGITransport  # noqa: E402

from app.database import async_engine, Base  # noqa: E402
from app.main import app  # noqa: E402


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_db():
    """Ensure isolated test DB tables exist; dispose engine and remove file at session end."""
    # 卫语句：跑测试前 assert 我们确实在隔离 DB 上（防回归）
    assert "_pytest_isolated.db" in str(async_engine.url), (
        f"❌ 测试 engine 不是隔离 DB！实际指向: {async_engine.url}\n"
        f"检查 conftest.py 顶部的 os.environ['DB_URL'] 是否在 import app.* 之前设置。"
    )

    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # 收尾：测试结束 dispose engine + 删除临时 DB 文件
    await async_engine.dispose()
    if _TEST_DB_PATH.exists():
        try:
            _TEST_DB_PATH.unlink()
        except OSError:
            # Windows 下偶尔文件 handle 没释放，下次跑测试时会自动清理
            pass


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for FastAPI integration tests."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
