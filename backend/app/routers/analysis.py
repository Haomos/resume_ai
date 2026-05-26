# backend/app/routers/analysis.py
"""Analysis router — single + batch scoring (user-isolated)."""

import asyncio
import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete

from app.config import get_config
from app.database import get_db, AsyncSessionLocal
from app.models.analysis import Analysis
from app.models.batch import Batch
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.analysis import AnalysisResult
from app.services.analyzer import analyze_one

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analyze", tags=["analyze"])


# ─── 单条分析（求职者模式） ─────────────────────────────

@router.post("", response_model=AnalysisResult)
async def create_analysis(
    resume_id: int = Query(...),
    job_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        analysis = await analyze_one(db, resume_id, job_id, mode="seeker", user_id=current_user.id)
    except ValueError as e:
        raise HTTPException(404, str(e))
    await db.commit()
    await db.refresh(analysis)
    return analysis


@router.get("", response_model=list[AnalysisResult])
async def list_analyses(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    resume_id: Optional[int] = Query(default=None),
    job_id: Optional[int] = Query(default=None),
    batch_id: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(Analysis).where(Analysis.user_id == current_user.id)
    if resume_id is not None:
        stmt = stmt.where(Analysis.resume_id == resume_id)
    if job_id is not None:
        stmt = stmt.where(Analysis.job_id == job_id)
    if batch_id is not None:
        stmt = stmt.where(Analysis.batch_id == batch_id)
    stmt = stmt.order_by(Analysis.id.desc()).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


# ─── 批次列表 ─────────────────────────────────────
@router.get("/batches")
async def list_batches(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(Batch).where(Batch.user_id == current_user.id).order_by(Batch.created_at.desc()).offset(offset).limit(limit)
    batches = (await db.execute(stmt)).scalars().all()
    if not batches:
        return []
    bids = [b.id for b in batches]
    counts_stmt = (
        select(Analysis.batch_id, func.count(Analysis.id))
        .where(Analysis.batch_id.in_(bids))
        .group_by(Analysis.batch_id)
    )
    counts_rows = (await db.execute(counts_stmt)).all()
    counts_map = {bid: int(c) for bid, c in counts_rows}
    return [
        {
            "batch_id": b.id,
            "job_id": b.job_id,
            "status": b.status,
            "total": b.total,
            "completed": b.completed,
            "failed_count": b.failed_count,
            "success_count": counts_map.get(b.id, 0),
            "created_at": b.created_at,
        }
        for b in batches
    ]


@router.get("/{analysis_id}", response_model=AnalysisResult)
async def get_analysis(
    analysis_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Analysis).where(Analysis.id == analysis_id, Analysis.user_id == current_user.id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(404, "Analysis not found")
    return analysis


@router.delete("/{analysis_id}")
async def delete_analysis(
    analysis_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Analysis).where(Analysis.id == analysis_id, Analysis.user_id == current_user.id))
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(404, "Analysis not found")
    await db.delete(analysis)
    await db.commit()
    return {"ok": True}


@router.get("/{analysis_id}/stream")
async def stream_analysis(analysis_id: int):
    raise HTTPException(501, "SSE streaming not yet implemented.")


# ─── 批量分析（招聘者模式） ─────────────────────────────

@router.post("/batch", status_code=202)
async def create_batch(
    background_tasks: BackgroundTasks,
    job_id: int = Query(...),
    resume_ids: list[int] = Query(...),
    concurrency: Optional[int] = Query(default=None, ge=1, le=10),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not resume_ids:
        raise HTTPException(400, "resume_ids cannot be empty")
    if len(resume_ids) > 50:
        raise HTTPException(400, "max 50 resumes per batch")

    batch_id = uuid.uuid4().hex
    batch = Batch(
        id=batch_id,
        user_id=current_user.id,
        job_id=job_id,
        status="pending",
        total=len(resume_ids),
        completed=0,
    )
    db.add(batch)
    await db.commit()

    background_tasks.add_task(_run_batch, batch_id, job_id, resume_ids, concurrency, current_user.id)
    return {"batch_id": batch_id, "status": "pending", "total": len(resume_ids)}


async def _run_batch(
    batch_id: str,
    job_id: int,
    resume_ids: list[int],
    concurrency_override: Optional[int] = None,
    user_id: int = 0,
) -> None:
    n = len(resume_ids)
    cfg = get_config()
    base_concurrency = concurrency_override if concurrency_override is not None else cfg.batch_concurrency
    concurrency = max(1, min(base_concurrency, n or 1))
    sem = asyncio.Semaphore(concurrency)

    async with AsyncSessionLocal() as db:
        batch = (await db.execute(select(Batch).where(Batch.id == batch_id))).scalar_one_or_none()
        if batch:
            batch.status = "running"
            await db.commit()

    async def _one(rid: int) -> None:
        async with sem:
            last_err: Optional[Exception] = None
            for attempt in range(3):
                async with AsyncSessionLocal() as db:
                    try:
                        await analyze_one(db, rid, job_id, batch_id=batch_id, mode="recruiter", user_id=user_id)
                        await db.commit()
                        break
                    except Exception as e:
                        last_err = e
                        logger.warning("Batch %s resume %d attempt %d failed: %s", batch_id, rid, attempt + 1, e)
                        await db.rollback()
                        if attempt < 2:
                            await asyncio.sleep(2 ** attempt)
            else:
                async with AsyncSessionLocal() as db:
                    try:
                        placeholder = Analysis(
                            user_id=user_id,
                            resume_id=rid,
                            job_id=job_id,
                            batch_id=batch_id,
                            base_score=0,
                            total_score=0,
                            dimension_scores_json=None,
                            model_config_json={"error": str(last_err) if last_err else "Unknown failure"},
                        )
                        db.add(placeholder)
                        await db.execute(
                            update(Batch).where(Batch.id == batch_id).values(failed_count=Batch.failed_count + 1)
                        )
                        await db.commit()
                    except Exception as be:
                        logger.warning("Batch %s resume %d placeholder write failed: %s", batch_id, rid, be)
                        await db.rollback()

            async with AsyncSessionLocal() as db:
                try:
                    await db.execute(
                        update(Batch).where(Batch.id == batch_id).values(completed=Batch.completed + 1)
                    )
                    await db.commit()
                except Exception as e:
                    logger.warning("Batch %s progress update failed: %s", batch_id, e)
                    await db.rollback()

    try:
        await asyncio.gather(*(_one(rid) for rid in resume_ids))
        async with AsyncSessionLocal() as db:
            batch = (await db.execute(select(Batch).where(Batch.id == batch_id))).scalar_one_or_none()
            if batch:
                batch.status = "completed"
                await db.commit()
    except Exception as e:
        logger.exception("Batch %s crashed: %s", batch_id, e)
        async with AsyncSessionLocal() as db:
            batch = (await db.execute(select(Batch).where(Batch.id == batch_id))).scalar_one_or_none()
            if batch:
                batch.status = "failed"
                await db.commit()


@router.get("/batches/{batch_id}")
async def get_batch(
    batch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    batch = (await db.execute(select(Batch).where(Batch.id == batch_id, Batch.user_id == current_user.id))).scalar_one_or_none()
    if not batch:
        raise HTTPException(404, "Batch not found")
    stmt = (
        select(Analysis)
        .where(Analysis.batch_id == batch_id)
        .order_by(Analysis.total_score.desc())
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    avg_score = (await db.execute(select(func.avg(Analysis.total_score)).where(Analysis.batch_id == batch_id))).scalar() or 0.0
    return {
        "batch_id": batch.id,
        "job_id": batch.job_id,
        "status": batch.status,
        "total": batch.total,
        "completed": batch.completed,
        "avg_score": round(float(avg_score), 2),
        "results": list(rows),
    }


@router.delete("/batches/{batch_id}")
async def delete_batch(
    batch_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    batch = (await db.execute(select(Batch).where(Batch.id == batch_id, Batch.user_id == current_user.id))).scalar_one_or_none()
    if not batch:
        raise HTTPException(404, "Batch not found")
    await db.execute(delete(Analysis).where(Analysis.batch_id == batch_id))
    await db.delete(batch)
    await db.commit()
    return {"ok": True}


@router.get("/batches/{batch_id}/stream")
async def stream_batch_progress(batch_id: str, request: Request):
    async with AsyncSessionLocal() as db:
        batch = (await db.execute(select(Batch).where(Batch.id == batch_id))).scalar_one_or_none()
        if not batch:
            raise HTTPException(404, "Batch not found")

    POLL_INTERVAL = 0.5
    TERMINAL_STATES = {"completed", "failed"}

    async def _gen():
        last_completed = -1
        last_status = ""
        while True:
            if await request.is_disconnected():
                logger.debug("SSE client disconnected mid-stream for batch %s", batch_id)
                return
            async with AsyncSessionLocal() as db:
                cur = (await db.execute(select(Batch).where(Batch.id == batch_id))).scalar_one_or_none()
            if cur is None:
                payload = json.dumps({
                    "batch_id": batch_id,
                    "completed": last_completed if last_completed >= 0 else 0,
                    "total": 0,
                    "status": "failed",
                })
                yield f"event: done\ndata: {payload}\n\n"
                return
            payload = json.dumps({
                "batch_id": cur.id,
                "completed": cur.completed,
                "total": cur.total,
                "status": cur.status,
            })
            if cur.completed != last_completed or cur.status != last_status:
                yield f"event: progress\ndata: {payload}\n\n"
                last_completed = cur.completed
                last_status = cur.status
            if cur.status in TERMINAL_STATES:
                yield f"event: done\ndata: {payload}\n\n"
                return
            await asyncio.sleep(POLL_INTERVAL)

    return StreamingResponse(
        _gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@router.get("/batches/{batch_id}/export")
async def export_batch(
    batch_id: str,
    format: str = Query(default="csv"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if format != "csv":
        raise HTTPException(400, "Only csv format supported")
    batch = (await db.execute(select(Batch).where(Batch.id == batch_id, Batch.user_id == current_user.id))).scalar_one_or_none()
    if not batch:
        raise HTTPException(404, "Batch not found")
    rows = (await db.execute(select(Analysis).where(Analysis.batch_id == batch_id).order_by(Analysis.total_score.desc()))).scalars().all()

    import csv, io
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["analysis_id", "resume_id", "job_id", "total_score", "base_score",
                     "skill_match", "experience_match", "education_match",
                     "salary_match", "location_match", "soft_skill_match",
                     "created_at"])
    for r in rows:
        dims = r.dimension_scores_json or {}
        writer.writerow([
            r.id, r.resume_id, r.job_id, r.total_score, r.base_score,
            dims.get("skill_match", ""),
            dims.get("experience_match", ""),
            dims.get("education_match", ""),
            dims.get("salary_match", ""),
            dims.get("location_match", ""),
            dims.get("soft_skill_match", ""),
            r.created_at.isoformat() if r.created_at else "",
        ])
    content = buf.getvalue()
    body = "﻿" + content
    from fastapi import Response
    from urllib.parse import quote
    filename = f"batch_{batch_id}.csv"
    safe_name = filename.encode("ascii", "ignore").decode() or "batch.csv"
    encoded_name = quote(filename, safe="")
    content_disposition = f"attachment; filename=\"{safe_name}\"; filename*=UTF-8''{encoded_name}"
    return Response(
        content=body.encode("utf-8"),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": content_disposition},
    )
