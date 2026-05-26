"""POST /api/analyze/batch?concurrency=N — Bug 4 修复测试."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_create_batch_accepts_concurrency_in_range(client: AsyncClient):
    """concurrency=1/2/5/10 都应通过 query 校验（不报 422）."""
    for c in (1, 2, 5, 10):
        # job_id/resume_ids 不存在不影响 query 校验，只看 422 是否触发
        resp = await client.post(
            f"/api/analyze/batch?job_id=999&resume_ids=999&concurrency={c}"
        )
        # 通过校验 → 202 或 4xx 但不是 422 (validation)
        assert resp.status_code != 422, (
            f"concurrency={c} 被拒绝，实际 status={resp.status_code} body={resp.text}"
        )


@pytest.mark.asyncio
async def test_create_batch_rejects_out_of_range_concurrency(client: AsyncClient):
    """concurrency=0/-1/11/100 应 422 校验失败."""
    for bad in (0, -1, 11, 100):
        resp = await client.post(
            f"/api/analyze/batch?job_id=999&resume_ids=999&concurrency={bad}"
        )
        assert resp.status_code == 422, (
            f"concurrency={bad} 应 422，实际 {resp.status_code} body={resp.text}"
        )


@pytest.mark.asyncio
async def test_create_batch_concurrency_optional(client: AsyncClient):
    """不传 concurrency — 应退回到 config 默认值，行为不变（202）."""
    resp = await client.post(
        "/api/analyze/batch?job_id=999&resume_ids=999"
    )
    assert resp.status_code != 422, (
        f"无 concurrency 时应 202 而非 422，实际 {resp.status_code} body={resp.text}"
    )
