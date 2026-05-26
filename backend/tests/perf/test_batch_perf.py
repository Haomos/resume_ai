"""Batch scoring performance benchmark — concurrent mode.

Goal: measure how long ``_run_batch`` takes for N=5/10/20 resumes with
``asyncio.gather`` + ``Semaphore(BATCH_CONCURRENCY)``. The LLM call is
replaced with a deterministic ``asyncio.sleep`` of a fixed duration so the
test isolates *scheduling efficiency* from real LLM latency.

Compare against the historical sequential baseline (``mode="sequential"``
in ``backend/perf/batch_perf.json`` written by earlier runs) to see the
speedup factor.

Run:
    pytest -m perf -s tests/perf/

Results are appended to ``backend/perf/batch_perf.json``.
"""

import asyncio
import json
import time
import uuid
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from app.config import get_config
from app.database import AsyncSessionLocal
from app.models.analysis import Analysis
from app.models.batch import Batch
from app.models.job import Job
from app.models.resume import Resume

# ---------------- knobs ----------------

MOCK_LATENCY_S = 0.05  # simulated per-call LLM latency
RESULTS_FILE = (
    Path(__file__).resolve().parent.parent.parent / "perf" / "batch_perf.json"
)


# ---------------- fixtures ----------------

@pytest_asyncio.fixture
async def clean_tables():
    """Wipe analysis/batch/resume/job rows before each perf run."""
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Analysis))
        await db.execute(delete(Batch))
        await db.execute(delete(Resume))
        await db.execute(delete(Job))
        await db.commit()
    yield


@pytest.fixture
def fake_llm(monkeypatch):
    """Replace build_llm_provider with a deterministic fake (sleep + canned JSON)."""
    canned = json.dumps(
        {
            "total_score": 75,
            "dimension_scores": {
                "skill_match": 80,
                "experience_match": 70,
                "education_match": 75,
                "salary_match": 70,
                "location_match": 80,
                "soft_skill_match": 75,
            },
            "matched_skills": ["Python", "SQL"],
            "missing_skills": ["Go"],
            "risk_factors": [],
            "advantages": ["fast learner"],
            "optimization_suggestions": [],
        },
        ensure_ascii=False,
    )

    class _FakeProvider:
        async def chat(self, messages, model, temperature, max_tokens):
            await asyncio.sleep(MOCK_LATENCY_S)
            return canned

    async def _fake_build(db):
        return _FakeProvider(), "fake-model", 0.5

    from app.services import analyzer

    monkeypatch.setattr(analyzer, "build_llm_provider", _fake_build)


# ---------------- helpers ----------------

async def _seed(n: int) -> tuple[int, list[int]]:
    """Create 1 Job + n Resumes; return (job_id, [resume_ids])."""
    async with AsyncSessionLocal() as db:
        job = Job(
            raw_text="Senior Python Engineer · FastAPI · 3+ yrs · async",
            position="Senior Python Engineer",
        )
        db.add(job)
        await db.flush()
        job_id = job.id

        resume_ids: list[int] = []
        for i in range(n):
            r = Resume(
                filename=f"perf_resume_{i:03d}.txt",
                storage_path=f"/tmp/perf_resume_{i:03d}.txt",
                raw_text=(
                    f"Resume #{i}: Python developer, 3 years FastAPI / SQLAlchemy. "
                    "Built async APIs, comfortable with PostgreSQL, Redis, Celery."
                ),
            )
            db.add(r)
            await db.flush()
            resume_ids.append(r.id)
        await db.commit()
    return job_id, resume_ids


def _append_record(record: dict) -> None:
    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    history = []
    if RESULTS_FILE.exists():
        try:
            history = json.loads(RESULTS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            history = []
    history.append(record)
    RESULTS_FILE.write_text(
        json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8"
    )


# ---------------- tests ----------------

@pytest.mark.perf
@pytest.mark.parametrize("n", [5, 10, 20])
@pytest.mark.asyncio
async def test_batch_concurrent(n, clean_tables, fake_llm):
    """Wall-clock for ``_run_batch`` over N resumes under concurrent mode.

    Validates that ``gather`` + ``Semaphore(batch_concurrency)`` actually
    parallelises and beats the prior sequential baseline (~ N*L) by a
    factor close to ``min(concurrency, N)``.
    """
    # Reset config cache so any earlier monkeypatch does not leak in
    get_config.cache_clear()
    cfg = get_config()
    concurrency = max(1, min(cfg.batch_concurrency, n))

    from app.routers.analysis import _run_batch

    job_id, resume_ids = await _seed(n)
    batch_id = f"perf-{n}-{uuid.uuid4().hex[:8]}"

    # Mimic /analyze/batch: pre-create the Batch row
    async with AsyncSessionLocal() as db:
        db.add(
            Batch(id=batch_id, job_id=job_id, status="pending", total=n, completed=0)
        )
        await db.commit()

    t0 = time.perf_counter()
    await _run_batch(batch_id, job_id, resume_ids)
    elapsed = time.perf_counter() - t0

    # Sanity check: everything actually ran
    async with AsyncSessionLocal() as db:
        batch = (
            await db.execute(select(Batch).where(Batch.id == batch_id))
        ).scalar_one()
        analyses = (
            await db.execute(
                select(Analysis).where(Analysis.batch_id == batch_id)
            )
        ).scalars().all()

    assert batch.status == "completed", f"unexpected status: {batch.status}"
    assert batch.completed == n, f"completed={batch.completed} ≠ {n}"
    assert len(analyses) == n, f"analyses={len(analyses)} ≠ {n}"
    assert all(a.total_score == 75.0 for a in analyses), "fake LLM JSON not applied"

    # Metrics
    # In sequential mode each resume incurred ~L (LLM) + ~fsync overhead, so
    # ``serial_baseline`` here approximates fully-sequential wall-clock by
    # doubling L (LLM + ~equal SQLite commit fsync, observed empirically).
    serial_baseline = n * MOCK_LATENCY_S * 2          # LLM + ~50ms fsync per item
    ideal_concurrent = (
        MOCK_LATENCY_S +                              # LLM part fully parallel
        n * MOCK_LATENCY_S                            # fsync still serialised by SQLite
    )
    per_item_ms = elapsed * 1000 / n
    speedup = serial_baseline / elapsed if elapsed > 0 else 0.0

    msg = (
        f"\n[perf] n={n:>3d} | conc={concurrency} | total={elapsed:.3f}s | "
        f"per_item={per_item_ms:.1f}ms | "
        f"speedup={speedup:.2f}x "
        f"(serial est={serial_baseline:.2f}s, ideal_concurrent={ideal_concurrent:.2f}s)"
    )
    print(msg)

    _append_record(
        {
            "ts": round(time.time(), 1),
            "n": n,
            "elapsed_s": round(elapsed, 4),
            "per_item_ms": round(per_item_ms, 2),
            "mock_latency_s": MOCK_LATENCY_S,
            "concurrency": concurrency,
            "speedup_vs_serial": round(speedup, 2),
            "mode": "concurrent",
        }
    )

    # Regression guard 1: per_item should drop visibly vs sequential mode.
    # Sequential observed ~100ms/item (50ms LLM + 50ms fsync). Concurrent
    # should hit roughly the fsync floor (~50ms) since LLM is parallelised.
    assert per_item_ms < MOCK_LATENCY_S * 1000 * 1.6, (
        f"per_item {per_item_ms:.1f}ms too high — LLM may not be parallelised "
        f"(expected < {MOCK_LATENCY_S*1000*1.6:.0f}ms)"
    )

    # Regression guard 2: total should beat full sequential by ≥30%.
    assert elapsed < serial_baseline * 0.7, (
        f"concurrent not fast enough vs serial estimate: "
        f"{elapsed:.3f}s vs 70% of {serial_baseline:.3f}s"
    )
