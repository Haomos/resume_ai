"""Real-LLM batch scoring perf benchmark — Ollama backed.

End-to-end measurement of ``_run_batch`` against a *live* Ollama instance.
Validates the speedup numbers extrapolated from MEMORY/ROADMAP §8.4.3 (real
LLM ≈ 2-5s/call → concurrent should beat sequential by ~ N/conc).

OPT-IN: this test is slow (≈ 30-90s total) and requires Ollama running
        locally with the configured chat model already pulled.

Required env:
    RUN_REAL_LLM_PERF=1                 # opt-in flag (skip otherwise)

Optional env:
    OLLAMA_URL=http://localhost:11434
    OLLAMA_MODEL=qwen3:1.7b             # default qwen3:1.7b (~2.3s/call)
                                        # use qwen3.5:4b for production-realistic numbers
    REAL_PERF_NS=3,5                    # comma-sep resume counts (default 3,5)
    REAL_PERF_CONCURRENCY=5             # concurrent run's semaphore size
    REAL_PERF_SKIP_SEQUENTIAL=0         # set to 1 to run only concurrent mode

Run (Windows cmd, from backend/):
    set RUN_REAL_LLM_PERF=1
    pytest -m realperf -s tests/perf/test_batch_perf_real.py

Output:
    backend/perf/batch_perf_real.json   # appended history
    Console                             # per-N timings + speedup table

Implementation notes
--------------------
* Bypasses ``SystemConfig`` table by monkeypatching ``analyzer.build_llm_provider``
  to return a fresh production ``OllamaProvider`` (with ``enable_thinking=False``,
  the post-patch default). This isolates the test from whatever the user
  has saved in ``Settings``.
* ``batch_concurrency`` is forced via ``get_config`` cache replacement
  (concurrency=1 for sequential, ``REAL_PERF_CONCURRENCY`` otherwise).
* Each parametrized case wipes ``analyses / batches / resumes / jobs``
  rows up-front to keep the result table small and deterministic.
* The HuggingFace embedding engine is NOT loaded — ``analyze_one`` only
  calls the LLM, so this test runs without bge-m3 in memory.
"""

import json
import os
import time
import uuid
from pathlib import Path
from typing import Optional

import httpx
import pytest
import pytest_asyncio
from sqlalchemy import delete, select

from app.config import AppConfig, get_config
from app.database import AsyncSessionLocal
from app.models.analysis import Analysis
from app.models.batch import Batch
from app.models.job import Job
from app.models.resume import Resume

# -------------------------- knobs --------------------------

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3:1.7b")
REAL_PERF_NS = [
    int(x) for x in os.environ.get("REAL_PERF_NS", "3,5").split(",") if x.strip()
]
REAL_PERF_CONCURRENCY = int(os.environ.get("REAL_PERF_CONCURRENCY", "5"))
REAL_PERF_SKIP_SEQUENTIAL = (
    os.environ.get("REAL_PERF_SKIP_SEQUENTIAL", "0").strip() == "1"
)

RESULTS_FILE = (
    Path(__file__).resolve().parent.parent.parent / "perf" / "batch_perf_real.json"
)

# Pre-built parametrize list: (n, mode) tuples.
_PERF_CASES: list[tuple[int, str]] = []
for _n in REAL_PERF_NS:
    if not REAL_PERF_SKIP_SEQUENTIAL:
        _PERF_CASES.append((_n, "sequential"))
    _PERF_CASES.append((_n, "concurrent"))


# -------------------------- guards --------------------------

def _ollama_reachable(url: str, model: str, timeout: float = 3.0) -> tuple[bool, str]:
    """Return (ok, reason). ok=True only when Ollama is up AND model exists."""
    try:
        with httpx.Client(timeout=timeout) as c:
            r = c.get(f"{url.rstrip('/')}/api/tags")
            r.raise_for_status()
            tags = {m.get("name") for m in r.json().get("models", [])}
            if model not in tags:
                return False, (
                    f"model {model!r} not pulled in Ollama (have: {sorted(tags)})"
                )
            return True, "ok"
    except httpx.HTTPError as e:
        return False, f"Ollama unreachable at {url}: {type(e).__name__}: {e}"


_OPT_IN = os.environ.get("RUN_REAL_LLM_PERF", "").strip() == "1"
_REACHABLE, _REACHABLE_REASON = (
    _ollama_reachable(OLLAMA_URL, OLLAMA_MODEL) if _OPT_IN else (False, "opt-out")
)

pytestmark = [
    pytest.mark.realperf,
    pytest.mark.skipif(
        not _OPT_IN,
        reason="set RUN_REAL_LLM_PERF=1 to enable real-LLM perf benchmarks",
    ),
    pytest.mark.skipif(
        _OPT_IN and not _REACHABLE,
        reason=f"prerequisites not met: {_REACHABLE_REASON}",
    ),
]


# -------------------------- fixtures --------------------------

@pytest_asyncio.fixture
async def clean_tables():
    """Wipe analyses / batches / resumes / jobs before each parametrized run."""
    async with AsyncSessionLocal() as db:
        await db.execute(delete(Analysis))
        await db.execute(delete(Batch))
        await db.execute(delete(Resume))
        await db.execute(delete(Job))
        await db.commit()
    yield


@pytest.fixture
def force_ollama_provider(monkeypatch):
    """Patch ``analyzer.build_llm_provider`` to return a real OllamaProvider.

    This bypasses ``SystemConfig`` overrides so the test reflects the
    production code path regardless of what the user has saved in DB.
    """
    from app.services import analyzer
    from app.services.llm_providers.ollama import OllamaProvider

    async def _ollama_only(_db):
        # ``enable_thinking`` defaults to False (post-patch), which is what
        # we want — qwen3 / qwen3.5 emit usable JSON in ``content``.
        return OllamaProvider(base_url=OLLAMA_URL), OLLAMA_MODEL, 0.3

    monkeypatch.setattr(analyzer, "build_llm_provider", _ollama_only)


# -------------------------- helpers --------------------------

_FAKE_RESUMES = [
    "Senior Python engineer · 5 yrs FastAPI / SQLAlchemy / asyncio · "
    "Built batch ETL pipelines on PostgreSQL + Redis + Celery, served 50k QPS",
    "Backend developer · 3 yrs Django + DRF · Migrating to FastAPI · "
    "Comfortable with PostgreSQL, basic Kubernetes, no async experience yet",
    "Tech lead · 8 yrs · Java/Spring -> Python migration lead · "
    "FastAPI, async, k8s, observability (OpenTelemetry, Prometheus)",
    "Junior dev · 1 yr · Flask + SQLAlchemy hobby projects · "
    "Just started learning FastAPI, no production async experience",
    "Data engineer · 4 yrs · PySpark + Airflow · "
    "Light FastAPI for internal dashboards, decent async knowledge",
    "DevOps engineer · 6 yrs · Python tooling for k8s + Helm · "
    "Some FastAPI for internal admin panels, async OK",
    "Full stack · 4 yrs · Node.js -> Python last 2 yrs · "
    "FastAPI rebuilds of legacy Express services, comfortable async",
    "ML engineer · 3 yrs · PyTorch + FastAPI inference servers · "
    "Async, gunicorn+uvicorn, Postgres for metadata",
    "Algo engineer · 5 yrs · Mostly research code, but shipped FastAPI "
    "endpoints for model serving · Python async fundamentals solid",
    "Frontend engineer · 6 yrs React/TS · "
    "Recent move to backend, learning FastAPI + async SQLAlchemy",
]

JD_TEXT = (
    "高级 Python 后端工程师 · FastAPI · 3+ 年异步经验 · "
    "PostgreSQL / Redis · 加分项: Kubernetes, 大模型应用经验"
)


async def _seed(n: int) -> tuple[int, list[int]]:
    """Insert 1 Job + n Resumes (text from _FAKE_RESUMES, cycled)."""
    async with AsyncSessionLocal() as db:
        job = Job(raw_text=JD_TEXT, position="高级 Python 后端工程师")
        db.add(job)
        await db.flush()
        job_id = job.id

        resume_ids: list[int] = []
        for i in range(n):
            text = _FAKE_RESUMES[i % len(_FAKE_RESUMES)]
            r = Resume(
                filename=f"realperf_resume_{i:03d}.txt",
                storage_path=f"/tmp/realperf_resume_{i:03d}.txt",
                raw_text=f"#{i}: {text}",
            )
            db.add(r)
            await db.flush()
            resume_ids.append(r.id)
        await db.commit()
    return job_id, resume_ids


def _append_record(record: dict) -> None:
    RESULTS_FILE.parent.mkdir(parents=True, exist_ok=True)
    history: list = []
    if RESULTS_FILE.exists():
        try:
            history = json.loads(RESULTS_FILE.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            history = []
    history.append(record)
    RESULTS_FILE.write_text(
        json.dumps(history, indent=2, ensure_ascii=False), encoding="utf-8"
    )


# -------------------------- session-level warmup --------------------------

@pytest_asyncio.fixture(scope="session")
async def ollama_warmup():
    """One-shot warmup so the first parametrized run isn't penalised by
    Ollama's cold model load (~5-10s extra)."""
    from app.services.llm_providers.ollama import OllamaProvider

    p = OllamaProvider(base_url=OLLAMA_URL)
    print(
        f"\n[realperf] warming up {OLLAMA_MODEL!r} via {OLLAMA_URL} "
        f"(this loads the model into memory once)..."
    )
    t0 = time.perf_counter()
    out = await p.chat(
        messages=[{"role": "user", "content": '请只输出: {"ok": true}'}],
        model=OLLAMA_MODEL,
        temperature=0.3,
        max_tokens=64,
    )
    elapsed = time.perf_counter() - t0
    content_len = len(out) if isinstance(out, str) else 0
    print(f"[realperf] warmup done in {elapsed:.2f}s (content_len={content_len})")


# -------------------------- the actual test --------------------------

@pytest.mark.realperf
@pytest.mark.parametrize("n,mode", _PERF_CASES, ids=lambda x: str(x))
@pytest.mark.asyncio
async def test_batch_real_ollama(
    n: int,
    mode: str,
    ollama_warmup,
    clean_tables,
    force_ollama_provider,
    monkeypatch,
):
    """One real-LLM batch run: N resumes, mode in {sequential, concurrent}.

    Records elapsed time + per-item latency + status counts to
    ``backend/perf/batch_perf_real.json`` and prints a summary line.
    """
    desired_concurrency = 1 if mode == "sequential" else REAL_PERF_CONCURRENCY
    get_config.cache_clear()
    base_cfg = get_config()
    forced = AppConfig(
        **{**base_cfg.model_dump(), "batch_concurrency": desired_concurrency}
    )
    monkeypatch.setattr("app.routers.analysis.get_config", lambda: forced)

    from app.routers.analysis import _run_batch

    job_id, resume_ids = await _seed(n)
    batch_id = f"realperf-{mode}-{n}-{uuid.uuid4().hex[:6]}"

    async with AsyncSessionLocal() as db:
        db.add(
            Batch(
                id=batch_id, job_id=job_id, status="pending", total=n, completed=0
            )
        )
        await db.commit()

    t0 = time.perf_counter()
    await _run_batch(batch_id, job_id, resume_ids)
    elapsed = time.perf_counter() - t0

    # Count successes vs failures
    async with AsyncSessionLocal() as db:
        batch = (
            await db.execute(select(Batch).where(Batch.id == batch_id))
        ).scalar_one()
        analyses = (
            (
                await db.execute(
                    select(Analysis).where(Analysis.batch_id == batch_id)
                )
            )
            .scalars()
            .all()
        )

    n_with_score = sum(1 for a in analyses if (a.total_score or 0) > 0)
    n_zero = len(analyses) - n_with_score
    avg_score: Optional[float] = (
        round(sum(a.total_score for a in analyses) / max(1, len(analyses)), 1)
        if analyses
        else None
    )
    per_item_s = elapsed / n
    effective_concurrency = max(1, min(desired_concurrency, n))

    msg = (
        f"\n[realperf] n={n:>2d} | mode={mode:<10s} | conc={effective_concurrency} | "
        f"total={elapsed:6.2f}s | per_item={per_item_s:5.2f}s | "
        f"with_score={n_with_score}/{n} (zero={n_zero}) | avg={avg_score}"
    )
    print(msg)

    record = {
        "ts": round(time.time(), 1),
        "n": n,
        "mode": mode,
        "concurrency": effective_concurrency,
        "elapsed_s": round(elapsed, 3),
        "per_item_s": round(per_item_s, 3),
        "n_with_score": n_with_score,
        "n_zero_score": n_zero,
        "avg_score": avg_score,
        "model": OLLAMA_MODEL,
        "ollama_url": OLLAMA_URL,
        "batch_status": batch.status,
    }
    _append_record(record)

    # ── correctness asserts ──
    assert batch.status == "completed", f"batch did not complete: {batch.status}"
    assert batch.completed == n, f"completed counter {batch.completed} != {n}"
    assert len(analyses) == n, f"row count {len(analyses)} != {n}"
    # If think:false works, *most* calls should yield non-zero scores. We
    # tolerate up to 30% zero (LLM hallucinates "0" sometimes) but flag
    # 100% zero as a sign that thinking-mode is leaking.
    assert n_with_score >= max(1, n - n // 3 - 1), (
        f"too many zero-score rows ({n_zero}/{n}) — "
        f"think:false may not be reaching the model"
    )
