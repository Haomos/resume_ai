# backend/app/main.py
"""FastAPI application entry point."""

# ─── 必须最先执行: 修正 conda env 内 SSL_CERT_FILE 指向不存在的 cacert.pem ───
# anaconda activate hook 会把 SSL_CERT_FILE 指向 envs/<env>/ssl/cacert.pem,
# 但该文件经常不存在（环境创建方式而异），导致 httpx/openai 启动 SSL context 即抛
# FileNotFoundError。用 certifi 提供的证书替代; 必须在 import 任何 httpx/openai 前完成。
import os
from pathlib import Path as _SslPath

_ssl_cert = os.environ.get("SSL_CERT_FILE")
if _ssl_cert and not _SslPath(_ssl_cert).exists():
    try:
        import certifi as _certifi  # type: ignore[import-not-found]
        os.environ["SSL_CERT_FILE"] = _certifi.where()
    except ImportError:
        os.environ.pop("SSL_CERT_FILE", None)
# ────────────────────────────────────────────────────────────────────────

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_config
from app.database import async_engine, Base
from app.routers import upload, jobs, analysis, ai, seeker_pool, auth
from app.routers import config as config_router

app_config = get_config()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: ensure upload dir + best-effort table create. Shutdown: cleanup.

    Schema management
    -----------------
    Phase 4 onwards Alembic is the source of truth (see ``backend/alembic/``).
    To deploy or upgrade run ``alembic upgrade head``.

    The ``Base.metadata.create_all`` below is a *bootstrap convenience* for
    fresh dev clones — it creates any tables missing from ``Base.metadata``
    but never alters existing ones. **Do not** add ad-hoc ``ALTER TABLE``
    statements here; instead generate a migration with::

        alembic revision --autogenerate -m "describe-the-change"
        alembic upgrade head
    """
    # 确保上传目录存在（首次启动 / 数据卷重建场景）
    from pathlib import Path
    Path(app_config.upload_dir).mkdir(parents=True, exist_ok=True)

    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await async_engine.dispose()


app = FastAPI(
    title=app_config.app_name,
    version="0.1.0",
    lifespan=lifespan,
)

# CORS: 浏览器规范禁止 allow_origins=["*"] + allow_credentials=True 同时使用,
# 因此显式列出本地 dev 端口。生产部署可通过 CORS_ORIGINS 环境变量覆盖。
_dev_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",  # vite dev (port fallback)
    "http://127.0.0.1:5174",
    "http://localhost:4173",  # vite preview
    "http://127.0.0.1:4173",
]
# 生产环境允许从环境变量注入额外域名（逗号分隔）
_extra_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_dev_origins + _extra_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(analysis.router, prefix="/api")
app.include_router(ai.router, prefix="/api")
app.include_router(seeker_pool.router, prefix="/api")
app.include_router(config_router.router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "ok", "app": app_config.app_name}