"""Entry Selector — Phase 7 §8.49.

Score and select resume entries against job requirements.
"""

import re
from datetime import datetime
from typing import Any


# ─── Constants ────────────────────────────────────────────────────────────

_MIN_ENTRY_SCORE = 0.20
"""单条经历匹配度硬门槛；低于此值的不进入候选集。"""

_MAX_SNAPSHOT_LENGTH = 1200

_DATE_RE = re.compile(r"(19\d{2}|20\d{2})")


def _calculate_recency_score(end_date: str | None) -> float:
    """根据 end_date 中的年份给出 recency 衰减分（0–1）。

    - end_date 为空：视为「至今」→ 1.0
    - 无法解析年份：保守给 0.5
    - 其它：每年衰减 15%（5 年前 = 0.25，>=7 年前 = 0.0）
    """
    if not end_date:
        return 1.0
    match = _DATE_RE.search(str(end_date))
    if not match:
        return 0.5
    year = int(match.group(1))
    current_year = datetime.now().year
    age = max(0, current_year - year)
    return max(0.0, 1.0 - age * 0.15)


def estimate_length(entry: dict[str, Any]) -> int:
    total = len(entry.get("summary", "")) + len(entry.get("description", ""))
    total += sum(len(h) for h in entry.get("highlights", []))
    total += len(entry.get("name", "")) + len(entry.get("position", ""))
    return total



def score_entry(entry: dict[str, Any], requirements: dict[str, Any]) -> float:
    """单条经历与 JD 的匹配分（0–1），用于 Selector 筛选和 entry_relevance 计算。"""
    score = 0.0
    entry_tags = set(t.lower() for t in entry.get("tags", []))
    entry_text = " ".join([
        entry.get("summary", ""),
        entry.get("description", ""),
        " ".join(entry.get("highlights", [])),
        entry.get("position", ""),
    ]).lower()

    hard_skills = set(s.lower() for s in (requirements.get("hard_skills") or []))
    if hard_skills:
        tag_match = len(entry_tags & hard_skills) / len(hard_skills)
        text_match = sum(1 for s in hard_skills if s in entry_text) / len(hard_skills)
        score += 0.35 * tag_match + 0.25 * text_match
    else:
        score += 0.3

    entry_domain = (entry.get("domain") or "").lower()
    req_domain = (requirements.get("domain") or "").lower()
    if entry_domain and req_domain:
        score += 0.2 if entry_domain == req_domain else 0.05 if req_domain in entry_text else 0.0
    else:
        score += 0.1

    req_seniority = requirements.get("seniority", "").lower()
    is_leadership = entry.get("is_leadership", False)
    if req_seniority in ("lead", "staff", "senior") and is_leadership:
        score += 0.1
    elif req_seniority in ("junior", "mid") and not is_leadership:
        score += 0.05

    score += 0.1 * _calculate_recency_score(entry.get("endDate"))

    # 短文本降权：少于 20 个有效字符的经历，匹配分打对折，避免"做测试"三个字虚高
    if len(entry_text.replace(" ", "")) < 20:
        score *= 0.5

    return min(1.0, score)


# ─── Hard Constraints Checker ─────────────────────────────────────────────



def select_entries(
    master_data: dict[str, Any],
    requirements: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    selected: list[tuple[str, dict[str, Any], float]] = []
    omitted: list[tuple[str, dict[str, Any], float]] = []
    budget = _MAX_SNAPSHOT_LENGTH

    # 教育经历强制保留（简历必备信息，不参与评分筛选）
    for entry in master_data.get("education", []):
        if isinstance(entry, dict):
            selected.append(("education", entry, 1.0))
            budget -= estimate_length(entry)

    # work 和 projects 按评分筛选
    all_entries: list[tuple[str, dict[str, Any], float]] = []
    for section in ("work", "projects"):
        for entry in master_data.get(section, []):
            if not isinstance(entry, dict):
                continue
            sc = score_entry(entry, requirements)
            all_entries.append((section, entry, sc))

    all_entries.sort(key=lambda x: x[2], reverse=True)
    must_have = set(s.lower() for s in (requirements.get("must_have") or []))
    covered_must = set()

    for section, entry, sc in all_entries:
        # 硬门槛：匹配度太低直接不选
        if sc < _MIN_ENTRY_SCORE:
            omitted.append((section, entry, sc))
            continue

        length = estimate_length(entry)
        entry_text = " ".join([
            entry.get("summary", ""),
            entry.get("description", ""),
            " ".join(entry.get("highlights", [])),
        ]).lower()

        covers_new_must = False
        for mh in must_have:
            if mh in entry_text and mh not in covered_must:
                covers_new_must = True
                break

        if covers_new_must or length <= budget:
            selected.append((section, entry, sc))
            budget -= length
            for mh in must_have:
                if mh in entry_text:
                    covered_must.add(mh)
        else:
            omitted.append((section, entry, sc))

    for _, entry, _ in selected:
        entry.setdefault("meta", {})["source_entry_id"] = entry.get("id")
    for _, entry, _ in omitted:
        entry.setdefault("meta", {})["source_entry_id"] = entry.get("id")

    return [e for _, e, _ in selected], [e for _, e, _ in omitted]


def average_relevance(entries: list[dict[str, Any]], requirements: dict[str, Any]) -> float:
    """计算入选经历的平均 score_entry 值（用于 entry_relevance 维度）。

    空列表返回 0.0；只算 dict 类型的 entry。
    """
    valid = [e for e in entries if isinstance(e, dict)]
    if not valid:
        return 0.0
    return round(sum(score_entry(e, requirements) for e in valid) / len(valid), 2)


# ─── Validator ────────────────────────────────────────────────────────────


