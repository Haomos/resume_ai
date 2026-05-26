"""Resume Generator Orchestrator — Phase 7 §8.49 + Fit Assessment.

Thin orchestrator that wires together the four submodules:

- ``parse_job_requirements`` — JD parser (LLM, defined here)
- ``select_entries`` / ``score_entry`` — re-exported from ``entry_selector``
- ``_assemble_snapshot`` / ``_polish_field`` / ``validate_generated`` / ``_build_generation_report`` — re-exported from ``snapshot_builder``
- ``_assess_fit`` — re-exported from ``fit_assessor``

Constants (``_MIN_ENTRY_SCORE`` / ``_MAX_SNAPSHOT_LENGTH``) live in
``entry_selector`` (single source of truth). Don't redefine them here.
"""

import json
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.llm_factory import build_llm_provider

# Re-export public API from submodules so existing imports keep working
from .fit_assessor import _assess_fit
from .entry_selector import (
    _MIN_ENTRY_SCORE,
    select_entries,
    score_entry,
)
from .snapshot_builder import (
    ValidationError,
    validate_generated,
    _assemble_snapshot,
    _polish_field,
    _build_generation_report,
)


# ─── JD Parser ────────────────────────────────────────────────────────────

_JD_PARSE_PROMPT = """你是一个专业的招聘需求解析器。请从以下 JD 文本中提取结构化需求。

输出严格的 JSON，格式如下：
{{
  "role_title": "职位名称",
  "seniority": "junior|mid|senior|lead|staff",
  "years_experience": 5,
  "hard_skills": ["技能1", "技能2"],
  "soft_skills": ["软技能1"],
  "domain": "行业领域",
  "must_have": ["关键词1", "关键词2", "3年+"],
  "nice_to_have": ["加分项"],
  "red_flags": ["JD 中提到的负面信号，如大小周、频繁出差等"],
  "company_stage": "startup|growth|mature",
  "location_requirement": "onsite|hybrid|remote|不限",
  "education_requirement": "本科|硕士|博士|不限",
  "visa_sponsorship": true,
  "management_scope": "无|小团队(2-5人)|中大团队(6+人)|未知",
  "hard_constraints": ["JD 中明确列出的硬性门槛条件，如'必须硕士以上学历'、'必须base上海'、'必须有金融背景'等"]
}}

规则：
- 只输出 JSON，不要任何其他文字。
- 如果某字段无法推断，用空字符串、空数组、null 或 false。
- hard_skills 必须是具体技术（如 golang, kubernetes, react），不要抽象概念。
- domain 从公司描述推断（电商/金融/游戏/AI/企业服务/SaaS/医疗等）。
- must_have 只放"不满足就直接挂"的条件，不要放 nice-to-have；每条用 2-5 个关键词概括（如 "Kubernetes", "3年+", "微服务"），不要写完整句子。
- years_experience 填数字（最低要求年限），无法推断填 null。
- hard_constraints 专门用于后续机器判定：任一条件不满足即否决投递。

JD 文本：
{jd_text}
"""


async def parse_job_requirements(db: AsyncSession, jd_text: str, user_id: int | None = None) -> dict[str, Any]:
    provider, model, temperature = await build_llm_provider(db, user_id=user_id)
    prompt = _JD_PARSE_PROMPT.format(jd_text=jd_text[:8000])
    response = await provider.chat(
        messages=[{"role": "user", "content": prompt}],
        model=model,
        temperature=0.1,
        max_tokens=2048,
    )
    text = response.strip()
    if text.startswith("```json"):
        text = text[7:]
    if text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    text = text.strip()
    try:
        result = json.loads(text)
        # Defensive: if LLM returns keys with newlines/quotes, normalize them
        if isinstance(result, dict):
            clean = {}
            for k, v in result.items():
                clean_k = k.strip().strip('"').strip("'")
                clean[clean_k] = v
            return clean
        # LLM may return a list or primitive; wrap it safely
        return {"_raw": result}
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        raise ValueError(f"JD parser returned invalid JSON: {response[:200]}")


# ─── Orchestrator ─────────────────────────────────────────────────────────


async def generate(
    db: AsyncSession,
    master_data: dict[str, Any],
    jd_text: str,
    selected_entry_ids: list[str] | None = None,
    polish: bool = False,
    user_id: int | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Generate a tailored resume snapshot.

    Phase 7 MVP: pure-code assembly + optional polish.

    Args:
        selected_entry_ids: 若提供，跳过 AI Selector，直接用用户指定的条目。
        polish: 是否对选中条目的 summary 调用 LLM 局部润色。
    Returns (generated_json, strategy_metadata).
    """
    requirements = await parse_job_requirements(db, jd_text, user_id=user_id)

    if selected_entry_ids is not None:
        all_entries: list[dict[str, Any]] = []
        for section in ("work", "projects", "education"):
            for entry in master_data.get(section, []):
                if isinstance(entry, dict):
                    all_entries.append(entry)
        selected = [e for e in all_entries if e.get("id") in selected_entry_ids]
        omitted = [e for e in all_entries if e.get("id") not in selected_entry_ids]
    else:
        selected, omitted = select_entries(master_data, requirements)

    # Step 1: pure-code assembly — fast, deterministic
    generated = _assemble_snapshot(master_data, selected, requirements)

    # Step 2: optional LLM polish — only for selected entries, fail-safe per field
    if polish:
        # Polish basics.summary
        orig_summary = generated.get("basics", {}).get("summary", "")
        if orig_summary:
            try:
                generated["basics"]["summary"] = await _polish_field(db, orig_summary, requirements, user_id=user_id)
            except Exception:
                pass  # fallback to original

        # Polish work[] and projects[] summaries
        for section in ("work", "projects"):
            for entry in generated.get(section, []):
                orig = entry.get("summary", "")
                if orig:
                    try:
                        entry["summary"] = await _polish_field(db, orig, requirements, user_id=user_id)
                    except Exception:
                        pass  # fallback to original

    errors = validate_generated(master_data, generated)
    if errors:
        raise ValidationError("; ".join(errors))

    # Build per-entry scores for frontend display
    all_entries_for_scores: list[dict[str, Any]] = []
    for section in ("work", "projects", "education"):
        for entry in master_data.get(section, []):
            if isinstance(entry, dict) and entry.get("id"):
                all_entries_for_scores.append(entry)

    entry_scores = {
        str(e.get("id")): round(score_entry(e, requirements), 2)
        for e in all_entries_for_scores
    }

    # ── Phase 7c: Multi-dimensional fit assessment ──
    fit = await _assess_fit(db, master_data, requirements, selected, omitted, user_id=user_id)

    strategy_notes: list[str] = []
    strategy_notes.append(f"从档案中评估了 {len(all_entries_for_scores)} 条经历，选出 {len(selected)} 条最相关的。")

    if fit.overall_matched:
        strategy_notes.append(f"✅ 已覆盖核心要求：{', '.join(fit.overall_matched[:8])}{' 等' if len(fit.overall_matched) > 8 else ''}。")
    if fit.overall_gaps:
        strategy_notes.append(f"⚠️ 档案中未直接匹配：{', '.join(fit.overall_gaps[:5])}{' 等' if len(fit.overall_gaps) > 5 else ''}。")
    if omitted:
        strategy_notes.append(f"省略了 {len(omitted)} 条经历（匹配度低于 {_MIN_ENTRY_SCORE * 100:.0f}% 或篇幅限制）。")

    for sug in fit.pass_suggestions:
        strategy_notes.append(sug)
    for sug in fit.enrichment_suggestions:
        strategy_notes.append(f"💡 {sug}")

    # Phase 7c: 生成投递报告（整合分析到生成流程）
    generation_report = _build_generation_report(fit, requirements, selected, omitted)

    strategy = {
        "overall_score": fit.display_score(),
        "selected_entries": [e.get("id") for e in selected],
        "omitted_entries": [e.get("id") for e in omitted],
        "requirements": requirements,
        "entry_scores": entry_scores,
        "low_match_warning": fit.display_score() < 0.35,
        "strategy_notes": strategy_notes,
        "coverage": {
            "matched": fit.overall_matched,
            "gaps": fit.overall_gaps,
        },
        "fit": fit.to_dict(),
        "veto": fit.veto,
        "veto_reasons": fit.veto_reasons,
        "enrichment_suggestions": fit.enrichment_suggestions,
        "report": generation_report,
    }

    return generated, strategy


