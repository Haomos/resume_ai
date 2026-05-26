"""Integration tests for GET /api/jobs/preview — Phase 4 URL preview (no DB write)."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_preview_unreachable_url_returns_error_no_db_write(client: AsyncClient):
    """Preview against a definitely-unreachable URL → 502/422 + no Job row created.

    This proves:
      1. /preview is wired up and validates the URL via the same Scrapling/httpx pipeline
      2. Failure path does NOT pollute the jobs table (no commit happened)

    Note: tests share a session-scoped DB (conftest.py::setup_db autouse), so we
    snapshot list length with the same `limit` before & after rather than asserting
    absolute counts.
    """
    SNAPSHOT = "/api/jobs?limit=200"  # max allowed by list_jobs query validator
    before = await client.get(SNAPSHOT)
    assert before.status_code == 200
    count_before = len(before.json())

    # Unreachable port — Scrapling fails, httpx fallback also fails → HTTPException
    resp = await client.get("/api/jobs/preview?url=http://127.0.0.1:1/job/123")
    # Accept 502 (network) or 422 (extraction) — both prove the pipeline ran without committing
    assert resp.status_code in (502, 422), resp.text

    after = await client.get(SNAPSHOT)
    assert after.status_code == 200
    count_after = len(after.json())
    assert count_after == count_before, (
        f"preview should NOT write a row on failure: before={count_before} after={count_after}"
    )


@pytest.mark.asyncio
async def test_preview_endpoint_registered(client: AsyncClient):
    """Smoke: GET /api/jobs/preview without ?url returns 422 (FastAPI query validation)."""
    resp = await client.get("/api/jobs/preview")
    assert resp.status_code == 422  # missing required query param
