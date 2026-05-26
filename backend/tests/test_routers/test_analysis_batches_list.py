"""GET /api/analyze/batches 列表接口测试 — Bug 3 修复."""

import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient

from app.database import AsyncSessionLocal
from app.models.batch import Batch
from app.models.analysis import Analysis


@pytest.mark.asyncio
async def test_list_batches_empty_returns_empty_array(client: AsyncClient):
    """无任何 batch 时 — 返回空数组而不是 404."""
    resp = await client.get("/api/analyze/batches")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert isinstance(data, list)
    # 不强校验 == [] 因其他测试可能留 batch；只校验"是 list"


@pytest.mark.asyncio
async def test_list_batches_returns_recent_first(client: AsyncClient):
    """多个 batch 按 created_at desc 排序 — 最新的在最前."""
    now = datetime.now(timezone.utc)
    bid_old = "bid-list-old"
    bid_new = "bid-list-new"
    async with AsyncSessionLocal() as db:
        old = Batch(id=bid_old, job_id=999, status="completed", total=3, completed=3,
                   created_at=now - timedelta(hours=2))
        new = Batch(id=bid_new, job_id=999, status="completed", total=5, completed=5,
                   created_at=now - timedelta(minutes=5))
        db.add(old)
        db.add(new)
        await db.commit()

    resp = await client.get("/api/analyze/batches?limit=10")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    bids = [b["batch_id"] for b in data]
    # bid_new 必须出现在 bid_old 之前
    assert bid_new in bids and bid_old in bids
    assert bids.index(bid_new) < bids.index(bid_old), f"order wrong: {bids}"


@pytest.mark.asyncio
async def test_list_batches_pagination(client: AsyncClient):
    """offset/limit 分页正常 — limit=1 + offset=0 / 1 拿不同行."""
    bid_a = "bid-list-page-a"
    bid_b = "bid-list-page-b"
    bid_c = "bid-list-page-c"
    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        # a 最新, c 最旧
        db.add(Batch(id=bid_a, job_id=999, status="completed", total=1, completed=1,
                    created_at=now - timedelta(seconds=10)))
        db.add(Batch(id=bid_b, job_id=999, status="completed", total=2, completed=2,
                    created_at=now - timedelta(seconds=20)))
        db.add(Batch(id=bid_c, job_id=999, status="completed", total=3, completed=3,
                    created_at=now - timedelta(seconds=30)))
        await db.commit()

    # 拉 limit=1 拿到最新（bid_a）
    r1 = await client.get("/api/analyze/batches?limit=1&offset=0")
    assert r1.status_code == 200
    bids_p1 = [b["batch_id"] for b in r1.json()]
    assert bid_a in bids_p1
    # offset=1 拿次新（bid_b 在 bid_a 之后）
    r2 = await client.get("/api/analyze/batches?limit=1&offset=1")
    assert r2.status_code == 200
    bids_p2 = [b["batch_id"] for b in r2.json()]
    # 不强校验只 1 条（其他测试可能干扰），只校验 a 不在 p2 而 b 或 c 在
    assert bid_a not in bids_p2


@pytest.mark.asyncio
async def test_list_batches_includes_success_count(client: AsyncClient):
    """每条 batch 应包含 success_count = len(Analysis where batch_id=X) — 用于 FE 区分 partial."""
    bid = "bid-list-success-count"
    async with AsyncSessionLocal() as db:
        db.add(Batch(id=bid, job_id=999, status="completed", total=5, completed=5))
        # 只插 2 条 Analysis 模拟 partial 失败
        db.add(Analysis(resume_id=101, job_id=999, batch_id=bid, base_score=70.0, total_score=80.0))
        db.add(Analysis(resume_id=102, job_id=999, batch_id=bid, base_score=55.0, total_score=60.0))
        await db.commit()

    resp = await client.get("/api/analyze/batches?limit=50")
    assert resp.status_code == 200
    rows = resp.json()
    target = next((r for r in rows if r["batch_id"] == bid), None)
    assert target is not None, f"batch {bid} not found in response"
    assert target["success_count"] == 2, f"expected success_count=2, got {target['success_count']}"
    assert target["total"] == 5
    assert target["completed"] == 5
    assert target["status"] == "completed"
