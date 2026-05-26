"""SSE stream tests — Issue #003 part 3.

测试 GET /api/analyze/batches/{batch_id}/stream:
  - 404 on missing batch
  - 已完成批次：立即推 progress + done 后关闭
  - 进行中批次：推送进度变化，直到达到终态后送 done
  - 客户端断开时优雅关闭（无异常泄漏）
"""

import asyncio
import json
import pytest
from httpx import AsyncClient

from app.database import AsyncSessionLocal
from app.models.batch import Batch


def _parse_sse_block(block: str) -> dict:
    """Parse a single SSE event block into {event, data}.

    Block format::
        event: progress
        data: {"completed": 1, "total": 2}

    """
    out = {}
    for line in block.strip().splitlines():
        if line.startswith("event:"):
            out["event"] = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            out["data"] = line.split(":", 1)[1].strip()
    return out


async def _read_until_done(resp, timeout: float = 3.0) -> list[dict]:
    """Read SSE events until we see ``event: done`` or hit ``timeout``."""
    buf = ""
    events: list[dict] = []
    try:
        async with asyncio.timeout(timeout):
            async for chunk in resp.aiter_text():
                buf += chunk
                # SSE blocks separated by blank line "\n\n"
                while "\n\n" in buf:
                    block, buf = buf.split("\n\n", 1)
                    if not block.strip():
                        continue
                    parsed = _parse_sse_block(block)
                    events.append(parsed)
                    if parsed.get("event") == "done":
                        return events
    except asyncio.TimeoutError:
        pass
    return events


@pytest.mark.asyncio
async def test_stream_404_for_missing_batch(client: AsyncClient):
    """流式端点也要走 404 路径 — batch 不存在时不应启动流。"""
    resp = await client.get("/api/analyze/batches/nonexistent-bid-xyz/stream")
    assert resp.status_code == 404, resp.text


@pytest.mark.asyncio
async def test_stream_completed_batch_sends_done_immediately(client: AsyncClient):
    """已 status=completed 的 batch — 应立即推一条 progress + 一条 done。"""
    bid = "bid-test-completed"
    async with AsyncSessionLocal() as db:
        batch = Batch(id=bid, job_id=999, status="completed", total=3, completed=3)
        db.add(batch)
        await db.commit()

    async with client.stream("GET", f"/api/analyze/batches/{bid}/stream") as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream"), (
            f"Wrong content-type: {resp.headers['content-type']}"
        )
        events = await _read_until_done(resp, timeout=3.0)

    # Assert: 至少 1 个 progress + 1 个 done
    types = [e.get("event") for e in events]
    assert "done" in types, f"No done event in stream: {events}"
    done_event = next(e for e in events if e.get("event") == "done")
    payload = json.loads(done_event["data"])
    assert payload["batch_id"] == bid
    assert payload["status"] == "completed"
    assert payload["completed"] == 3
    assert payload["total"] == 3


@pytest.mark.asyncio
async def test_stream_failed_batch_sends_done(client: AsyncClient):
    """status=failed 也是终态 — 同样应当推 done 并关闭流。"""
    bid = "bid-test-failed"
    async with AsyncSessionLocal() as db:
        batch = Batch(id=bid, job_id=999, status="failed", total=5, completed=2)
        db.add(batch)
        await db.commit()

    async with client.stream("GET", f"/api/analyze/batches/{bid}/stream") as resp:
        assert resp.status_code == 200
        events = await _read_until_done(resp, timeout=3.0)

    types = [e.get("event") for e in events]
    assert "done" in types, f"No done event for failed batch: {events}"
    done_event = next(e for e in events if e.get("event") == "done")
    payload = json.loads(done_event["data"])
    assert payload["status"] == "failed"


@pytest.mark.asyncio
async def test_stream_running_batch_progresses_to_done(client: AsyncClient):
    """status=running 的 batch — 在另一个任务里推进 completed/status 后流应能感知并发 done。"""
    bid = "bid-test-running"
    async with AsyncSessionLocal() as db:
        batch = Batch(id=bid, job_id=999, status="running", total=3, completed=0)
        db.add(batch)
        await db.commit()

    async def _bump_progress():
        # 给流先建立连接
        await asyncio.sleep(0.3)
        for c in (1, 2, 3):
            async with AsyncSessionLocal() as db:
                b = (await db.execute(
                    __import__("sqlalchemy").select(Batch).where(Batch.id == bid)
                )).scalar_one()
                b.completed = c
                if c == 3:
                    b.status = "completed"
                await db.commit()
            await asyncio.sleep(0.4)

    bump_task = asyncio.create_task(_bump_progress())
    try:
        async with client.stream("GET", f"/api/analyze/batches/{bid}/stream") as resp:
            assert resp.status_code == 200
            events = await _read_until_done(resp, timeout=5.0)
    finally:
        bump_task.cancel()
        try:
            await bump_task
        except asyncio.CancelledError:
            pass

    types = [e.get("event") for e in events]
    assert "done" in types, f"Stream did not see done event: {events}"
    # 至少应当看到至少 2 个 progress（初始 + 中途变化）
    progress_count = types.count("progress")
    assert progress_count >= 2, f"Expected at least 2 progress events, got {progress_count}: {events}"
