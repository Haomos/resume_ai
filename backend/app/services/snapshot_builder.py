"""Snapshot Builder — Phase 7 §8.49.

Assemble, polish, validate and report generation for resume snapshots.
"""

import json
import re
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.llm_factory import build_llm_provider
from .fit_assessor import FitAssessment


class ValidationError(Exception):
    pass



def validate_generated(master_data: dict[str, Any], generated: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    master_map: dict[str, dict[str, Any]] = {}
    for section in ("work", "projects", "education"):
        for entry in master_data.get(section, []):
            eid = entry.get("id")
            if eid:
                master_map[eid] = entry

    for section in ("work", "projects", "education"):
        for i, item in enumerate(generated.get(section, [])):
            sid = item.get("meta", {}).get("source_entry_id")
            if not sid:
                errors.append(f"{section}[{i}] missing source_entry_id")
                continue
            master_item = master_map.get(sid)
            if not master_item:
                errors.append(f"{section}[{i}] source_entry_id '{sid}' not found in master pool")
                continue
            for field in ("name", "institution"):
                if field in item and field in master_item and item[field] != master_item[field]:
                    errors.append(f"{section}[{i}].{field} mutated: '{master_item[field]}' -> '{item[field]}'")
            for field in ("startDate", "endDate"):
                if field in item and field in master_item and item[field] != master_item[field]:
                    errors.append(f"{section}[{i}].{field} mutated: '{master_item[field]}' -> '{item[field]}'")

    return errors


# ─── Assembler (pure-code, no LLM) ────────────────────────────────────────

import copy

from app.services.parser.json_resume_transformer import SCHEMA_VERSION



def _assemble_snapshot(
    master_data: dict[str, Any],
    selected: list[dict[str, Any]],
    requirements: dict[str, Any],
) -> dict[str, Any]:
    """Assemble a snapshot from selected entries without LLM rewriting.

    Fast & deterministic: selected entries go in as-is, skills reordered
    to put JD-matching ones first.
    """
    work: list[dict[str, Any]] = []
    projects: list[dict[str, Any]] = []
    education: list[dict[str, Any]] = []

    for entry in selected:
        entry_copy = copy.deepcopy(entry)
        entry_copy.setdefault("meta", {})["source_entry_id"] = entry_copy.get("id")
        # Clean internal-only fields
        entry_copy.pop("tags", None)
        entry_copy.pop("domain", None)
        entry_copy.pop("impact_score", None)
        entry_copy.pop("is_leadership", None)
        entry_copy.pop("is_open_source", None)

        if "institution" in entry_copy:
            education.append(entry_copy)
        elif "company" in entry_copy or "position" in entry_copy:
            work.append(entry_copy)
        else:
            projects.append(entry_copy)

    # Reorder skills: JD hard-skills first
    master_skills = list(master_data.get("skills", []))
    hard_skills = set(s.lower() for s in (requirements.get("hard_skills") or []))

    def _skill_score(skill: dict[str, Any]) -> int:
        name = str(skill.get("name", "")).lower()
        keywords = [str(k).lower() for k in skill.get("keywords", [])]
        txt = f"{name} {' '.join(keywords)}"
        return 2 if any(h in txt for h in hard_skills) else 1

    master_skills.sort(key=_skill_score, reverse=True)

    basics = copy.deepcopy(master_data.get("basics", {}))

    return {
        "meta": {
            "schema_version": SCHEMA_VERSION,
            "source": "generated",
            "generation_notes": "基于档案自动组装（无 LLM 改写）",
        },
        "basics": basics,
        "work": work,
        "projects": projects,
        "education": education,
        "skills": master_skills,
        "languages": list(master_data.get("languages", [])),
        "certificates": list(master_data.get("certificates", [])),
        "awards": list(master_data.get("awards", [])),
        "publications": list(master_data.get("publications", [])),
        "interests": list(master_data.get("interests", [])),
        "references": list(master_data.get("references", [])),
        "volunteer": list(master_data.get("volunteer", [])),
        "customSections": list(master_data.get("customSections", [])),
    }


# ─── Polish (lightweight LLM rewrite for selected entries) ────────────────

_POLISH_PROMPT = """请用更专业、更贴合招聘方（JD）的语言风格，改写以下简历描述。

【JD 要求】
{requirements}

【原始描述】
{text}

要求：
- 保持所有事实不变（公司名、职位、日期、数字）
- 用 JD 关键词替换同义词
- 突出与 JD 相关的技能和经验
- 只输出改写后的文本，不要解释
"""



async def _polish_field(
    db: AsyncSession,
    text: str,
    requirements: dict[str, Any],
    user_id: int | None = None,
) -> str:
    """Lightweight LLM polish for a single field. Fail-safe: returns original on error."""
    if not text or not text.strip():
        return text
    provider, model, _temperature = await build_llm_provider(db, user_id=user_id)
    prompt = _POLISH_PROMPT.format(
        requirements=json.dumps(requirements, ensure_ascii=False, indent=2),
        text=text[:2000],
    )
    response = await provider.chat(
        messages=[{"role": "user", "content": prompt}],
        model=model,
        temperature=0.3,
        max_tokens=1024,
    )
    polished = response.strip()
    if polished.startswith("```"):
        polished = polished.split("\n", 1)[1] if "\n" in polished else ""
    if polished.endswith("```"):
        polished = polished.rsplit("\n", 1)[0] if "\n" in polished else polished
    return polished.strip() or text


# ─── Main Orchestrator ────────────────────────────────────────────────────



def _build_generation_report(
    fit: FitAssessment,
    requirements: dict[str, Any],
    selected: list[dict[str, Any]],
    omitted: list[dict[str, Any]],
) -> dict[str, Any]:
    """基于 fit 评估结果，生成投递报告（用于存入 snapshot meta 和历史记录展示）。"""

    # Verdict 判定
    if fit.veto:
        verdict_action = "mismatch"
    elif fit.dimensions.weighted_score() >= 0.7:
        verdict_action = "apply"
    elif fit.dimensions.weighted_score() >= 0.55:
        verdict_action = "gap_fill_first"
    else:
        verdict_action = "mismatch"

    action_items: list[dict[str, Any]] = []

    # 基于 gaps 生成改进建议
    for gap in fit.overall_gaps[:5]:
        action_items.append({
            "priority": "high",
            "issue": f"缺少核心要求：{gap}",
            "rewritten": f"建议在档案中补充与「{gap}」相关的项目经历或技能，并添加对应 tag 以提升匹配度。",
        })

    # 基于 enrichment_suggestions 生成建议
    for sug in fit.enrichment_suggestions[:3]:
        action_items.append({
            "priority": "medium",
            "issue": sug.replace("💡 ", ""),
            "rewritten": "",
        })

    return {
        "assessment": {
            "verdict": {"action": verdict_action},
            "gate": {
                "pass": not fit.veto,
                "reasons": fit.veto_reasons if fit.veto else [],
            },
            "core": {
                "matched_skills": fit.overall_matched,
                "missing_skills": fit.overall_gaps,
                "gaps": fit.overall_gaps,
            },
        },
        "matched_skills": fit.overall_matched,
        "missing_skills": fit.overall_gaps,
        "action_items": action_items,
        "fit": fit.to_dict(),
        "selected_count": len(selected),
        "omitted_count": len(omitted),
    }
