"""AI assistant router — resume polish (user-isolated).

Phase 5 §8.36 A15: jd_align / quantify_suggest / full_diagnose / list_diagnoses
endpoints removed.
保留 polish 作为编辑器选段润色的唯一 LLM endpoint。
"""

import logging

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.routers.auth import get_current_user
from app.services.llm_factory import build_llm_provider

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/polish")
async def polish_text(
    text: str = Query(..., min_length=1, max_length=4000),
    instruction: str = Query(
        default="优化这段简历内容的措辞，使其更专业、简洁、有说服力",
        max_length=500,
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        provider, model_name, temperature = await build_llm_provider(db, user_id=current_user.id)
    except Exception as e:
        logger.warning("LLM provider init failed: %s", e)
        raise HTTPException(503, f"LLM 未配置或不可用: {e}")

    prompt = f"""你是资深 HR 与技术面试官，擅长简历优化。

要求：{instruction}

原文：
{text}

请直接返回优化后的文本，不要添加任何解释、前缀、代码块包裹或"优化后："等标记。只输出纯文本。"""

    try:
        raw = await provider.chat(
            messages=[{"role": "user", "content": prompt}],
            model=model_name,
            temperature=max(0.1, temperature - 0.2),
            max_tokens=2048,
        )
    except Exception as e:
        logger.warning("Polish LLM call failed: %s", e)
        raise HTTPException(502, f"LLM 调用失败: {e}")

    polished = raw.strip() if isinstance(raw, str) else str(raw).strip()
    if polished.startswith("```"):
        polished = polished.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

    return {"original": text, "polished": polished, "before": text, "after": polished, "model": model_name}
