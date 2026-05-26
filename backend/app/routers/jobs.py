# backend/app/routers/jobs.py
"""Job management router (user-isolated)."""

import asyncio
import json
import logging
import os

import httpx
import trafilatura
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models.job import Job
from app.models.user import User
from app.routers.auth import get_current_user
from app.schemas.job import (
    JobCreate,
    JobExtractRequest,
    JobExtractResponse,
    JobPreviewResponse,
    JobResponse,
)
from app.services.llm_factory import build_llm_provider

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("", response_model=JobResponse)
async def create_job(
    data: JobCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    job = Job(user_id=current_user.id, **data.model_dump())
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


@router.get("", response_model=list[JobResponse])
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    stmt = select(Job).where(Job.user_id == current_user.id).order_by(Job.id.desc()).offset(offset).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


_ANTI_BOT_HINTS = ("安全验证", "security-check", "验证码", "captcha", "正在加载中", "加载中", "请开启JavaScript", "请启用 JavaScript")


def _looks_like_antibot(html: str) -> bool:
    text = html[:5000].lower()
    if any(h.lower() in text for h in _ANTI_BOT_HINTS):
        return True
    if len(html) < 300:
        return True
    if html.count("_0x") > 5:
        return True
    return False


async def _extract_job_text(url: str) -> str:
    html_content: str | None = None

    try:
        from scrapling import Fetcher
        fetcher = Fetcher()
        page = await asyncio.to_thread(fetcher.get, url, timeout=30)
        if page.status == 200:
            candidate = page.html_content or page.text or ""
            if candidate and not _looks_like_antibot(candidate):
                html_content = candidate
                logger.info("Scrapling Fetcher succeeded for %s", url)
            else:
                logger.warning("Scrapling Fetcher returned anti-bot/empty page for %s", url)
        else:
            logger.warning("Scrapling Fetcher returned status %s for %s", page.status, url)
    except Exception as e:
        logger.warning("Scrapling Fetcher failed: %s", e)

    if html_content is None:
        try:
            from patchright.async_api import async_playwright
            chromium_path = "/ms-playwright/chromium-1217/chrome-linux64/chrome"
            launch_kwargs: dict = {
                "headless": True,
                "args": ["--disable-blink-features=AutomationControlled"],
            }
            if os.path.exists(chromium_path):
                launch_kwargs["executable_path"] = chromium_path
            async with async_playwright() as p:
                browser = await p.chromium.launch(**launch_kwargs)
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    viewport={"width": 1920, "height": 1080},
                    locale="zh-CN",
                    timezone_id="Asia/Shanghai",
                )
                page = await context.new_page()
                await page.goto(url, wait_until="domcontentloaded", timeout=25000)
                await page.wait_for_timeout(2000)
                candidate = await page.content()
                await browser.close()
                if candidate and not _looks_like_antibot(candidate):
                    html_content = candidate
                    logger.info("Patchright succeeded for %s (%d bytes)", url, len(candidate))
                else:
                    logger.warning("Patchright returned anti-bot/empty page for %s (%d bytes)", url, len(candidate or ""))
        except Exception as e:
            logger.warning("Patchright failed: %s", e)

    if html_content is None:
        try:
            async with httpx.AsyncClient(timeout=30, follow_redirects=True, trust_env=False) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                candidate = resp.text
                if candidate and not _looks_like_antibot(candidate):
                    html_content = candidate
                    logger.info("httpx fallback succeeded for %s", url)
                else:
                    logger.warning("httpx returned anti-bot/empty page for %s", url)
        except httpx.RequestError as e:
            logger.warning("httpx fallback failed: %s", e)
        except httpx.HTTPStatusError as e:
            logger.warning("httpx fallback HTTP error: %s", e)

    if html_content is None:
        raise HTTPException(502, "无法抓取该链接（反爬拦截 / 网络错误），请直接粘贴文本")

    extracted = trafilatura.extract(html_content, include_comments=False, include_tables=False)
    if not extracted:
        raise HTTPException(422, "无法从该页面提取正文，请直接粘贴文本")
    return extracted.strip()


@router.get("/preview", response_model=JobPreviewResponse)
async def preview_job(url: str):
    text = await _extract_job_text(url)
    return JobPreviewResponse(source_url=url, raw_text=text)


@router.post("/fetch", response_model=JobResponse)
async def fetch_job(
    url: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    text = await _extract_job_text(url)
    job = Job(
        user_id=current_user.id,
        source_url=url,
        raw_text=text,
        position="",
        company="",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


_EXTRACT_PROMPT = """你是资深招聘信息分析师。从下面这段招聘信息中抽取关键字段并以严格 JSON 返回。

要求:
- 字段不在原文中明确提到时，对应值用 null（不要瞎猜，"某互联网大厂"这种掩码也算 null）
- salary_min / salary_max 单位是月薪人民币元
- location 用城市名
- position 提取核心职位名
- company 提取真实公司名，不接受掩码

招聘信息:
{raw_text}

返回严格 JSON（不要代码块标记）:
{{
  "position": "..." 或 null,
  "company": "..." 或 null,
  "salary_min": 数字 或 null,
  "salary_max": 数字 或 null,
  "location": "..." 或 null
}}"""


def _strip_code_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return text


@router.post("/extract", response_model=JobExtractResponse)
async def extract_job_fields(
    data: JobExtractRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        provider, model_name, temperature = await build_llm_provider(db, user_id=current_user.id)
    except Exception as e:
        logger.warning("extract_job_fields: build_provider failed: %s", e)
        return JobExtractResponse(ok=False, error=f"LLM 未配置或不可用: {str(e)[:160]}")

    prompt = _EXTRACT_PROMPT.format(raw_text=data.raw_text[:3000])
    try:
        raw = await provider.chat(
            messages=[{"role": "user", "content": prompt}],
            model=model_name,
            temperature=max(0.1, temperature - 0.3),
            max_tokens=512,
        )
    except Exception as e:
        msg = f"{type(e).__name__}: {str(e)[:160]}"
        logger.info("extract_job_fields: LLM call failed: %s", msg)
        return JobExtractResponse(ok=False, error=f"LLM 调用失败: {msg}", model=model_name)

    text = raw if isinstance(raw, str) else str(raw)
    text = _strip_code_fences(text)
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as e:
        logger.info("extract_job_fields: JSON parse failed; raw[:200]=%r", text[:200])
        return JobExtractResponse(ok=False, error=f"LLM 返回非 JSON 格式: {str(e)[:120]}", model=model_name)

    def _nullable_str(v):
        if v is None or (isinstance(v, str) and v.strip() in ("", "null", "None")):
            return None
        return v.strip() if isinstance(v, str) else v

    def _nullable_num(v):
        if v is None or v == "":
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    return JobExtractResponse(
        ok=True,
        position=_nullable_str(parsed.get("position")),
        company=_nullable_str(parsed.get("company")),
        salary_min=_nullable_num(parsed.get("salary_min")),
        salary_max=_nullable_num(parsed.get("salary_max")),
        location=_nullable_str(parsed.get("location")),
        model=model_name,
    )


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == current_user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.put("/{job_id}", response_model=JobResponse)
async def update_job(
    job_id: int,
    data: JobCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == current_user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    for field, value in data.model_dump().items():
        setattr(job, field, value)
    await db.commit()
    await db.refresh(job)
    return job


@router.delete("/{job_id}")
async def delete_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Job).where(Job.id == job_id, Job.user_id == current_user.id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    await db.delete(job)
    await db.commit()
    return {"ok": True}
