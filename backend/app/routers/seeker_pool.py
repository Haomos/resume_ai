"""Seeker Pool API — Phase 7 §8.48 (user-isolated).

Core endpoints for the Master Data Pool (job-seeker's structured career archive).
"""

import copy
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.analysis import Analysis
from app.models.resume import Resume
from app.models.job import Job
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.resume import ResumeResponse
from app.services.parser.json_resume_transformer import SCHEMA_VERSION, empty_json_resume
from app.services import resume_generator

router = APIRouter(prefix="/seeker", tags=["seeker-pool"])


def _ensure_entry_ids(data: dict[str, Any]) -> dict[str, Any]:
    data = dict(data)
    for section in ("work", "projects", "education", "skills"):
        entries = list(data.get(section, []))
        for entry in entries:
            if isinstance(entry, dict) and not entry.get("id"):
                entry["id"] = str(uuid.uuid4())
        data[section] = entries
    return data


class PoolImportPayload(BaseModel):
    resume_id: int = Field(..., description="Source legacy resume ID")
    selected_entry_ids: list[str] = Field(default_factory=list, description="Entry IDs to merge")


class GeneratePayload(BaseModel):
    job_id: int = Field(..., description="Target job ID")
    selected_entry_ids: list[str] = Field(default_factory=list, description="User-confirmed entry IDs")
    polish: bool = Field(default=False, description="Enable LLM polish")


async def _get_or_create_master_pool(db: AsyncSession, user_id: int) -> Resume:
    result = await db.execute(
        select(Resume).where(Resume.user_id == user_id, Resume.record_type == "master_pool").order_by(Resume.id.asc())
    )
    pool = result.scalar_one_or_none()
    if pool is None:
        pool = Resume(
            user_id=user_id,
            filename="",
            storage_path="",
            raw_text="",
            structured_json=empty_json_resume(),
            schema_version=SCHEMA_VERSION,
            record_type="master_pool",
        )
        db.add(pool)
        await db.commit()
        await db.refresh(pool)
    return pool


@router.get("/pool", response_model=ResumeResponse)
async def get_pool(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pool = await _get_or_create_master_pool(db, current_user.id)
    return pool


@router.put("/pool", response_model=ResumeResponse)
async def update_pool(
    data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pool = await _get_or_create_master_pool(db, current_user.id)
    payload = data.get("structured_json", pool.structured_json or {})
    pool.structured_json = _ensure_entry_ids(payload)
    pool.schema_version = SCHEMA_VERSION
    await db.commit()
    await db.refresh(pool)
    return pool


@router.post("/pool/import", response_model=ResumeResponse)
async def import_into_pool(
    payload: PoolImportPayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pool = await _get_or_create_master_pool(db, current_user.id)
    pool_data: dict[str, Any] = {**empty_json_resume(), **dict(pool.structured_json or {})}

    result = await db.execute(
        select(Resume).where(Resume.id == payload.resume_id, Resume.user_id == current_user.id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(404, "Source resume not found")
    if source.record_type not in ("legacy",):
        raise HTTPException(400, "Can only import from legacy resumes")

    source_data: dict[str, Any] = dict(source.structured_json or {})
    for section in ("work", "projects", "education", "skills"):
        pool_section = list(pool_data.get(section, []))
        source_section = list(source_data.get(section, []))
        source_map = {str(item.get("id")): item for item in source_section if item.get("id") is not None}
        index_map = {f"{section}-{i}": item for i, item in enumerate(source_section) if isinstance(item, dict)}
        for entry_id in payload.selected_entry_ids:
            entry = source_map.get(str(entry_id))
            if entry is None:
                entry = index_map.get(entry_id)
            if entry is None:
                continue
            entry = dict(entry)
            if not entry.get("id"):
                entry["id"] = str(uuid.uuid4())
            eid = str(entry["id"])
            existing_ids = {str(e.get("id")) for e in pool_section if e.get("id") is not None}
            if eid in existing_ids:
                pool_section = [e if str(e.get("id")) != eid else entry for e in pool_section]
            else:
                pool_section.append(entry)
        if pool_section:
            pool_data[section] = pool_section

    pool.structured_json = pool_data
    pool.schema_version = SCHEMA_VERSION
    await db.commit()
    await db.refresh(pool)
    return pool


@router.post("/analyze", response_model=dict)
async def analyze_pool(
    payload: GeneratePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pool = await _get_or_create_master_pool(db, current_user.id)
    job_result = await db.execute(
        select(Job).where(Job.id == payload.job_id, Job.user_id == current_user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")

    try:
        requirements = await resume_generator.parse_job_requirements(db, job.raw_text or "", user_id=current_user.id)
    except Exception as e:
        raise HTTPException(500, f"JD 解析失败: {e}")

    master_copy = copy.deepcopy(pool.structured_json or {})
    selected, omitted = resume_generator.select_entries(master_copy, requirements)
    fit = await resume_generator._assess_fit(db, master_copy, requirements, selected, omitted, user_id=current_user.id)
    report = resume_generator._build_generation_report(fit, requirements, selected, omitted)

    analysis = Analysis(
        user_id=current_user.id,
        resume_id=pool.id,
        job_id=job.id,
        base_score=fit.dimensions.weighted_score(),
        total_score=fit.display_score(),
        dimension_scores_json=fit.to_dict(),
        model_config_json={
            "source": "master_pool",
            "assessment": report.get("assessment"),
            "matched_skills": report.get("matched_skills"),
            "missing_skills": report.get("missing_skills"),
            "action_items": report.get("action_items"),
            "fit": fit.to_dict(),
            "report": report,
            "job_title": job.position,
            "job_company": job.company,
        },
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    entry_scores = {
        str(e.get("id")): round(resume_generator.score_entry(e, requirements), 2)
        for e in selected + omitted if e.get("id")
    }
    return {
        "analysis_id": analysis.id,
        "strategy": {
            "overall_score": fit.display_score(),
            "selected_entries": [e.get("id") for e in selected],
            "omitted_entries": [e.get("id") for e in omitted],
            "requirements": requirements,
            "entry_scores": entry_scores,
            "low_match_warning": fit.display_score() < 0.35,
            "coverage": {"matched": fit.overall_matched, "gaps": fit.overall_gaps},
            "fit": fit.to_dict(),
            "veto": fit.veto,
            "veto_reasons": fit.veto_reasons,
            "enrichment_suggestions": fit.enrichment_suggestions,
            "report": report,
        },
        "selected": selected,
        "omitted": omitted,
    }


@router.post("/generate-preview", response_model=dict)
async def generate_preview(
    payload: GeneratePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pool = await _get_or_create_master_pool(db, current_user.id)
    job_result = await db.execute(
        select(Job).where(Job.id == payload.job_id, Job.user_id == current_user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")

    try:
        requirements = await resume_generator.parse_job_requirements(db, job.raw_text or "", user_id=current_user.id)
    except Exception as e:
        raise HTTPException(500, f"JD 解析失败: {e}")

    master_copy = copy.deepcopy(pool.structured_json or {})
    selected, omitted = resume_generator.select_entries(master_copy, requirements)
    fit = await resume_generator._assess_fit(db, master_copy, requirements, selected, omitted, user_id=current_user.id)

    entry_scores = {
        str(e.get("id")): round(resume_generator.score_entry(e, requirements), 2)
        for e in selected + omitted if e.get("id")
    }
    strategy = {
        "overall_score": fit.display_score(),
        "selected_entries": [e.get("id") for e in selected],
        "omitted_entries": [e.get("id") for e in omitted],
        "requirements": requirements,
        "entry_scores": entry_scores,
        "low_match_warning": fit.display_score() < 0.35,
        "coverage": {"matched": fit.overall_matched, "gaps": fit.overall_gaps},
        "fit": fit.to_dict(),
        "veto": fit.veto,
        "veto_reasons": fit.veto_reasons,
        "enrichment_suggestions": fit.enrichment_suggestions,
    }
    report = resume_generator._build_generation_report(fit, requirements, selected, omitted)

    analysis = Analysis(
        user_id=current_user.id,
        resume_id=pool.id,
        job_id=job.id,
        base_score=fit.dimensions.weighted_score(),
        total_score=fit.display_score(),
        dimension_scores_json=fit.to_dict(),
        model_config_json={
            "source": "master_pool_preview",
            "assessment": report.get("assessment"),
            "matched_skills": report.get("matched_skills"),
            "missing_skills": report.get("missing_skills"),
            "action_items": report.get("action_items"),
            "fit": fit.to_dict(),
            "report": report,
            "job_title": job.position,
            "job_company": job.company,
        },
    )
    db.add(analysis)
    await db.commit()
    await db.refresh(analysis)

    return {
        "analysis_id": analysis.id,
        "strategy": strategy,
        "selected": selected,
        "omitted": omitted,
    }


@router.post("/generate", response_model=dict)
async def generate_snapshot(
    payload: GeneratePayload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pool = await _get_or_create_master_pool(db, current_user.id)
    job_result = await db.execute(
        select(Job).where(Job.id == payload.job_id, Job.user_id == current_user.id)
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")

    try:
        snapshot_data, strategy = await resume_generator.generate(
            db,
            pool.structured_json or {},
            job.raw_text or "",
            selected_entry_ids=payload.selected_entry_ids if payload.selected_entry_ids else None,
            polish=payload.polish,
            user_id=current_user.id,
        )
    except resume_generator.ValidationError as e:
        raise HTTPException(422, f"生成校验失败: {e}")
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"AI 生成失败: {type(e).__name__}: {e}")

    snapshot_data.setdefault("meta", {})
    snapshot_data["meta"]["job_id"] = job.id
    snapshot_data["meta"]["report"] = strategy.get("report", {})
    snapshot_data["meta"]["generated_at"] = datetime.now(timezone.utc).isoformat()

    snapshot = Resume(
        user_id=current_user.id,
        filename=f"投递_{job.company or 'Unknown'}_{job.position or 'Unknown'}.pdf",
        storage_path="",
        raw_text="",
        structured_json=snapshot_data,
        schema_version=SCHEMA_VERSION,
        record_type="snapshot",
    )
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)

    return {
        "snapshot_id": snapshot.id,
        "resume": ResumeResponse.model_validate(snapshot).model_dump(),
        "strategy": strategy,
    }
