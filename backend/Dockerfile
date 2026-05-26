# ResumeAI Backend — FastAPI + SQLAlchemy + Playwright PDF renderer
#
# Build context: ./backend/ (NOT repo root) — keeps the image surface small
# and makes it impossible for the Dockerfile to accidentally `COPY` private
# files from MEMORY/, docs/, etc. that live outside the backend dir.
#
# Build:    docker build -t resumeai-backend ./backend
# Run:      docker run -p 8000:8000 -v $(pwd)/data:/app/data resumeai-backend
#
# Base image rationale:
# - mcr.microsoft.com/playwright/python ships Chromium + all browser sys
#   deps (libnss3 / libdrm2 / libxkbcommon0 / fonts-liberation / ...).
# - Installing those manually on python:3.11-slim is fragile and bumps the
#   image size by a similar amount anyway; the official image is the right
#   trade-off for a project that genuinely needs headless Chromium.
# - Pin to v1.59.0 — matches requirements.txt `playwright>=1.59.0`.
# - noble tag (Ubuntu 24.04) ships Python 3.12; our deps all support 3.10+.
#
# Image layout:
#   /app/app/         Python source (FastAPI app)
#   /app/alembic/     Migration scripts
#   /app/alembic.ini  Migration config (DB URL via env)
#   /app/data/        Volume mount for SQLite + uploads (NOT in image)
#
FROM mcr.microsoft.com/playwright/python:v1.59.0-noble

# ─── 1. System deps ─────────────────────────────────────────────────────
# fonts-noto-cjk: Chinese glyph rendering for PDF export (pdf_renderer.py)
# tini:           proper PID 1 to forward signals to uvicorn worker
# Cleanup apt lists in the same layer to keep the image small.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      fonts-noto-cjk \
      tini \
 && rm -rf /var/lib/apt/lists/*

# ─── 2. Non-root user ───────────────────────────────────────────────────
# The Playwright base image already provides `pwuser` (UID/GID 1001) as
# its conventional non-root user. We reuse it rather than create our own
# `appuser` — avoids UID collision and signals we understand the base
# image's contract.

WORKDIR /app

# ─── 3. Python deps (cached layer — only re-runs when requirements change) ─
# Copy requirements first so docker layer cache is invalidated only when
# the dep file actually changes — not on every code edit.
COPY --chown=pwuser:pwuser requirements.txt /app/requirements.txt
USER pwuser
RUN pip install --no-cache-dir --user --upgrade pip \
 && pip install --no-cache-dir --user -r /app/requirements.txt
ENV PATH=/home/pwuser/.local/bin:$PATH

# ─── 4. Application code ────────────────────────────────────────────────
# Order from "rarely changed" → "frequently changed" so cache invalidation
# is minimized on hot iteration.
COPY --chown=pwuser:pwuser alembic.ini /app/alembic.ini
COPY --chown=pwuser:pwuser alembic /app/alembic
COPY --chown=pwuser:pwuser app /app/app
COPY --chown=pwuser:pwuser docker-entrypoint.sh /app/docker-entrypoint.sh

# ─── 5. Volume mount points ─────────────────────────────────────────────
# SQLite DB + uploaded resume files live here. Docker compose mounts a
# named volume at /app/data so data persists across `docker compose down`.
USER root
RUN mkdir -p /app/data /app/data/uploads \
 && chown -R pwuser:pwuser /app/data \
 && chmod +x /app/docker-entrypoint.sh
USER pwuser

# ─── 6. Network ─────────────────────────────────────────────────────────
EXPOSE 8000

# ─── 7. Health check ────────────────────────────────────────────────────
# Use Python (always present) instead of curl so we don't depend on apt
# packages that may not be in the base image.
# --start-period: app needs time to run alembic upgrade on first boot.
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:8000/health',timeout=5).status==200 else 1)"

# ─── 8. Entrypoint ──────────────────────────────────────────────────────
# tini → docker-entrypoint.sh → alembic upgrade head → uvicorn
# tini handles SIGTERM forwarding for graceful shutdown.
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker-entrypoint.sh"]
