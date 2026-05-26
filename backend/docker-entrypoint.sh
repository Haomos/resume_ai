#!/usr/bin/env bash
#
# ResumeAI Backend — container entrypoint
#
# Responsibilities:
#   1. Run Alembic migrations to bring DB schema up to head
#      (idempotent — no-op if already at head)
#   2. exec uvicorn so it inherits PID 1 from tini (signal forwarding)
#
# Override with `docker run ... bash` for shell access.
#
set -euo pipefail

# ─── Configuration via env (with safe defaults) ──────────────────────────
HOST="${UVICORN_HOST:-0.0.0.0}"
PORT="${UVICORN_PORT:-8000}"
WORKERS="${UVICORN_WORKERS:-1}"
LOG_LEVEL="${UVICORN_LOG_LEVEL:-info}"

# ─── 1. DB migrations ────────────────────────────────────────────────────
echo "[entrypoint] Running 'alembic upgrade head'..."
if ! alembic upgrade head; then
    echo "[entrypoint] ERROR: alembic upgrade failed" >&2
    exit 1
fi
echo "[entrypoint] DB schema is at head."

# ─── 2. Optional: SKIP_MIGRATIONS escape hatch ──────────────────────────
# Useful for `docker run ... bash` debugging without auto-migrating.
# Just exit early if the caller asked us to.
if [ "${SKIP_UVICORN:-0}" = "1" ]; then
    echo "[entrypoint] SKIP_UVICORN=1 set, sleeping..."
    exec sleep infinity
fi

# ─── 3. Start uvicorn ────────────────────────────────────────────────────
echo "[entrypoint] Starting uvicorn on ${HOST}:${PORT} (workers=${WORKERS}, log=${LOG_LEVEL})..."
exec uvicorn app.main:app \
    --host "${HOST}" \
    --port "${PORT}" \
    --workers "${WORKERS}" \
    --log-level "${LOG_LEVEL}" \
    --proxy-headers \
    --forwarded-allow-ips '*'
