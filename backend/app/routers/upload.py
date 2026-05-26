# backend/app/routers/upload.py
"""Resume upload router (user-isolated)."""

import io
import re
from pathlib import Path

import anyio
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, Query, Body
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.resume import Resume
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.resume import ResumeResponse, ResumeUpdate
from app.config import get_config
from app.services.parser.factory import extract_text, extract_structured_html
from app.services.parser.structured_extractor import extract_structured_json
from app.services.parser.json_resume_transformer import SCHEMA_VERSION, empty_json_resume
from app.services.patch_validator import apply_patches
from app.services.resume_html_renderer import render_resume_html

router = APIRouter(prefix="/resumes", tags=["resumes"])
config = get_config()


class StructuredPayload(BaseModel):
    structured_json: dict = Field(..., description="Full JSON Resume schema dict")


class PatchItem(BaseModel):
    path: str = Field(..., max_length=200)
    new_value: object = Field(..., description="Replacement value (str | list[str] etc.)")


class PatchPayload(BaseModel):
    patches: list[PatchItem] = Field(default_factory=list, max_length=20)


async def _save_and_parse(file: UploadFile, db: AsyncSession, user_id: int, record_type: str = "legacy") -> Resume:
    if not file.filename:
        raise HTTPException(400, "Missing filename")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in config.allowed_extensions:
        raise HTTPException(400, f"Unsupported file type: {ext or '(none)'}")
    content = await file.read()
    if len(content) > config.max_file_size:
        raise HTTPException(400, "File too large")
    if len(content) == 0:
        raise HTTPException(400, "Empty file")

    upload_dir = Path(config.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    storage_path = upload_dir / file.filename
    storage_path.write_bytes(content)

    raw_text = extract_text(content, file.filename)
    html = extract_structured_html(content, file.filename)
    if html is None and raw_text:
        html = render_resume_html(raw_text)
    structured = extract_structured_json(raw_text) if raw_text else None
    if not structured:
        structured = empty_json_resume()
        if raw_text:
            structured.setdefault("basics", {})["summary"] = raw_text
    if html:
        img_match = re.search("""<img[^>]+class=["']resume-photo["'][^>]+src=["']([^"']+)["']""", html)
        if img_match and not structured.get("basics", {}).get("image"):
            structured.setdefault("basics", {})["image"] = img_match.group(1)

    resume = Resume(
        user_id=user_id,
        filename=file.filename,
        storage_path=str(storage_path),
        raw_text=raw_text,
        structured_json=structured,
        schema_version=SCHEMA_VERSION,
        record_type=record_type,
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)
    return resume


@router.post("", status_code=201, response_model=ResumeResponse)
async def create_blank_resume(
    data: dict = Body(default={}),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    filename = data.get("filename", "未命名简历") or "未命名简历"
    record_type = data.get("record_type", "legacy")
    resume = Resume(
        user_id=current_user.id,
        filename=filename,
        storage_path="",
        raw_text="",
        structured_json=empty_json_resume(),
        schema_version=SCHEMA_VERSION,
        record_type=record_type,
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)
    return resume


@router.post("/upload", status_code=201, response_model=ResumeResponse)
async def upload_resume(
    file: UploadFile = File(...),
    record_type: str = Query(default="legacy", description="Record type: legacy | candidate"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await _save_and_parse(file, db, current_user.id, record_type=record_type)


@router.post("/upload-batch", status_code=201, response_model=list[ResumeResponse])
async def upload_batch(
    files: list[UploadFile] = File(...),
    record_type: str = Query(default="legacy", description="Record type: legacy | candidate"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    results: list[Resume] = []
    for file in files:
        try:
            resume = await _save_and_parse(file, db, current_user.id, record_type=record_type)
            results.append(resume)
        except HTTPException:
            continue
    return results


@router.get("", response_model=list[ResumeResponse])
async def list_resumes(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    record_type: str | None = Query(default=None, description="Filter by record_type"),
):
    stmt = select(Resume).where(Resume.user_id == current_user.id).order_by(Resume.id.desc()).offset(offset).limit(limit)
    if record_type:
        stmt = stmt.where(Resume.record_type == record_type)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(
    resume_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")
    return resume


@router.put("/{resume_id}", response_model=ResumeResponse)
async def update_resume(
    resume_id: int,
    payload: ResumeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")
    if not payload.filename or not payload.filename.strip():
        raise HTTPException(422, "Filename cannot be empty")
    resume.filename = payload.filename.strip()
    await db.commit()
    await db.refresh(resume)
    return resume


@router.put("/{resume_id}/line_height", response_model=ResumeResponse)
async def update_resume_line_height(
    resume_id: int,
    value: float = Query(..., ge=0.8, le=3.0, description="Line height (0.8-3.0)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")
    resume.line_height = value
    await db.commit()
    await db.refresh(resume)
    return resume


@router.put("/{resume_id}/structured", response_model=ResumeResponse)
async def update_resume_structured(
    resume_id: int,
    payload: StructuredPayload = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")
    resume.structured_json = payload.structured_json
    resume.schema_version = SCHEMA_VERSION
    await db.commit()
    await db.refresh(resume)
    return resume


@router.patch("/{resume_id}/structured")
async def patch_resume_structured(
    resume_id: int,
    payload: PatchPayload = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")
    if not resume.structured_json:
        raise HTTPException(409, "Resume has no structured_json yet")
    patches_data = [p.model_dump() for p in payload.patches]
    new_structured, rejected = apply_patches(resume.structured_json, patches_data)
    resume.structured_json = new_structured
    resume.schema_version = SCHEMA_VERSION
    await db.commit()
    await db.refresh(resume)
    return {
        "resume": ResumeResponse.model_validate(resume).model_dump(),
        "applied_count": len(payload.patches) - len(rejected),
        "rejected": rejected,
    }


@router.delete("/{resume_id}")
async def delete_resume(
    resume_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")
    try:
        Path(resume.storage_path).unlink(missing_ok=True)
    except Exception:
        pass
    await db.delete(resume)
    await db.commit()
    return {"ok": True}


class ExportPdfRequest(BaseModel):
    html: str = Field(default="", max_length=2_000_000)
    filename: str = Field(default="resume.pdf", max_length=200)
    scale: float = Field(default=1.0, ge=0.1, le=2.0)


@router.post("/{resume_id}/export-pdf")
async def export_pdf(
    resume_id: int,
    body: ExportPdfRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id))
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(404, "Resume not found")
    from app.services.pdf_renderer import html_to_pdf
    from urllib.parse import quote
    pdf_bytes = await anyio.to_thread.run_sync(html_to_pdf, body.html, body.scale)
    # RFC 5987: filename*=UTF-8''%E7%AE%80%E5%8E%86.pdf for Unicode; plain filename for fallback
    safe_name = body.filename.encode('ascii', 'ignore').decode() or 'resume.pdf'
    encoded_name = quote(body.filename, safe='')
    content_disposition = f"attachment; filename=\"{safe_name}\"; filename*=UTF-8''{encoded_name}"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": content_disposition},
    )
