"""Fit Assessor — Phase 7c §8.51.

LLM-driven multi-dimensional fit assessment between master pool + JD.

5 维度（前端展示口径）→ LLM 5 个原生维度（career-ops 模式）一一对应：
- skills_fit       ← cv_match
- experience_depth ← north_star
- domain_fit       ← cultural
- entry_relevance  ← 后端基于 selected 的平均 score_entry 计算（LLM 不擅长）
- hard_constraints ← red_flags

Veto: verdict == "mismatch" 或 global_score < 3.5。
"""

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services.llm_factory import build_llm_provider
from app.services.entry_selector import average_relevance


# ─── Fit Assessment Constants ─────────────────────────────────────────────

_VETO_THRESHOLD = 0.35
"""全局加权契合度低于此值 → 拒绝生成（硬阻断）。前端 fit dashboard 颜色档位也用这个阈值。"""


@dataclass
class FitDimensions:
    """多维度契合度评分（每维 0.0–1.0）。"""

    skills_fit: float = 0.0
    """LLM cv_match：hard_skills + must_have 覆盖度（Step 1 mapping 后评分）。"""

    experience_depth: float = 0.0
    """LLM north_star：职业路径与岗位方向的一致度。"""

    domain_fit: float = 0.0
    """LLM cultural：团队规模/远程/成长路径等文化层面契合。"""

    entry_relevance: float = 0.0
    """入选经历的平均 score_entry 值（后端计算，非 LLM）。"""

    hard_constraints: float = 1.0
    """LLM red_flags：红旗信号（鬼岗、PUA、压榨等）。0=严重红旗，1=无红旗。"""

    details: dict[str, str] = field(default_factory=dict)
    """每维度的具体评估说明（供前端展示）。"""

    def weighted_score(self) -> float:
        return round(
            self.skills_fit * 0.30
            + self.experience_depth * 0.20
            + self.domain_fit * 0.15
            + self.entry_relevance * 0.20
            + self.hard_constraints * 0.15,
            2,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "skills_fit": round(self.skills_fit, 2),
            "experience_depth": round(self.experience_depth, 2),
            "domain_fit": round(self.domain_fit, 2),
            "entry_relevance": round(self.entry_relevance, 2),
            "hard_constraints": round(self.hard_constraints, 2),
            "weighted_score": self.weighted_score(),
            "details": self.details,
        }


@dataclass
class FitAssessment:
    """契合度评估结果，包含是否阻断及建议。"""

    dimensions: FitDimensions = field(default_factory=FitDimensions)
    veto: bool = False
    veto_reasons: list[str] = field(default_factory=list)
    enrichment_suggestions: list[str] = field(default_factory=list)
    pass_suggestions: list[str] = field(default_factory=list)
    overall_matched: list[str] = field(default_factory=list)
    overall_gaps: list[str] = field(default_factory=list)

    def display_score(self) -> float:
        """前端展示用的分数 —— 与 weighted_score 等价。

        §8.51 曾有「must-have 覆盖率太低就封顶到 veto 阈值」的逻辑，但
        career-ops 模式下 LLM 已经在 cv_match 内综合评估 must-have，封顶
        逻辑变成 dead branch，故直接返 weighted_score。
        """
        return self.dimensions.weighted_score()

    def to_dict(self) -> dict[str, Any]:
        base = self.dimensions.to_dict()
        base["weighted_score"] = self.display_score()
        return {
            **base,
            "veto": self.veto,
            "veto_reasons": self.veto_reasons,
            "enrichment_suggestions": self.enrichment_suggestions,
            "pass_suggestions": self.pass_suggestions,
            "overall_matched": self.overall_matched,
            "overall_gaps": self.overall_gaps,
        }


_FIT_ASSESS_PROMPT = """你的任务：基于给定的候选人档案（JSON Resume）和岗位需求，逐条对比、分析匹配度，输出结构化评估报告。

当前评估日期：{current_date}

## 档案
{master_data_json}

## 岗位需求
{requirements_json}

## 评估步骤（必须按此顺序思考）

**Step 1 — 逐条映射（Requirement Mapping）**
对岗位需求中的每一项（hard_skills、must_have、years_experience、seniority、domain、hard_constraints）：
1. 在档案的 work/projects/skills/education 中找出最相关的具体条目（引用原文）
2. 判断匹配程度：
   - strong：档案中有直接对应证据（如 JD 要求 K8s，档案写"负责 200+ 节点 K8s 集群"）
   - weak：档案有间接相关经验（如 JD 要求 Docker，档案写"使用容器化部署"）
   - gap：档案中无对应证据
3. 写出判断依据（必须引用档案中的具体文字）

**Step 2 — Gap 分析**
对每一项标记为 gap 的要求：
1. 判断是否 hard blocker（不满足就直接被淘汰）
2. 判断是否有相邻经验可以包装（如没管过 10 人团队，但带过 3 人小组）
3. 给出具体、可执行的弥补建议（不要泛泛而谈）

**Step 3 — 维度评分（1-5 分，必须基于 Step 1 的映射结果）**

| 分数 | cv_match 定义 |
|------|---------------|
| 5.0 | hard_skills + must_have 全部 strong 覆盖，有量化证明点（如"提升 30% 性能"） |
| 4.0 | 大部分 strong 覆盖，少数 weak/gap 但可用相邻经验包装 |
| 3.0 | 约一半覆盖，有明显 gap 但不全是 hard blocker |
| 2.0 | 少量覆盖，多个 hard blocker |
| 1.0 | 几乎无覆盖 |

| 分数 | north_star 定义 |
|------|-----------------|
| 5.0 | 岗位方向与档案中体现的职业路径完全一致 |
| 4.0 | 方向一致，细节有偏差（如都是后端但技术栈不同） |
| 3.0 | 部分相关，可作为过渡但不是最优选择 |
| 2.0 | 方向偏离，需要较大转型 |
| 1.0 | 完全偏离，会损害职业发展 |

| 分数 | comp 定义 |
|------|-----------|
| 5.0 | JD 明确给出高于市场 75% 分位的薪资 |
| 4.0 | 薪资在市场平均水平之上 |
| 3.0 | JD 未提薪资或处于市场平均 |
| 2.0 | 低于市场平均 |
| 1.0 | 明显低于市场或存在压榨信号（如大小周无加班费） |

| 分数 | cultural 定义 |
|------|---------------|
| 5.0 | 远程/混合友好，团队规模明确，成长路径清晰 |
| 4.0 | 大部分条件满足，有小瑕疵 |
| 3.0 | 有明显问题但不致命（如偶尔加班） |
| 2.0 | 多个红旗（如频繁出差、无技术成长空间） |
| 1.0 | 严重问题（如大小周、PUA 文化） |

| 分数 | red_flags 定义 |
|------|----------------|
| 5.0 | 无任何红旗 |
| 4.0 | 有小瑕疵（如 JD 写得模糊） |
| 3.0 | 有可疑信号（如公司近期裁员） |
| 2.0 | 多个红旗（如岗位挂了很久、重复发布） |
| 1.0 | 严重红旗（如疑似 ghost job、诈骗） |

global_score = cv_match * 0.40 + north_star * 0.20 + comp * 0.15 + cultural * 0.15 + red_flags * 0.10

**Step 4 — Verdict**
- apply（global ≥ 4.0）：建议投递
- gap_fill_first（3.5 ≤ global < 4.0）：有缺口但可弥补，建议先补再投
- mismatch（global < 3.5）：不建议投递

## 输出格式

只输出 JSON，不要任何其他文字：

{{
  "global_score": 4.2,
  "verdict": "apply|gap_fill_first|mismatch",
  "dimensions": {{
    "cv_match": {{"score": 4.0, "detail": "..."}},
    "north_star": {{"score": 4.5, "detail": "..."}},
    "comp": {{"score": 3.5, "detail": "..."}},
    "cultural": {{"score": 4.0, "detail": "..."}},
    "red_flags": {{"score": 5.0, "detail": "..."}}
  }},
  "requirement_mapping": [
    {{"jd_req": "...", "pool_evidence": "...", "match": "strong|weak|gap", "notes": "..."}}
  ],
  "gaps": [
    {{"item": "...", "severity": "blocker|gap|nice_to_have", "mitigation": "...", "is_hard_blocker": false}}
  ],
  "veto_reasons": ["..."],
  "enrichment_suggestions": ["..."]
}}
"""



# ─── Fit Assessment Orchestrator ──────────────────────────────────────────



async def _assess_fit(
    db: AsyncSession,
    master_data: dict[str, Any],
    requirements: dict[str, Any],
    selected: list[dict[str, Any]],
    omitted: list[dict[str, Any]],
    user_id: int | None = None,
) -> FitAssessment:
    """基于 master pool + JD requirements，调用 LLM 输出多维度契合度评估（career-ops 模式）。"""

    provider, model, temperature = await build_llm_provider(db, user_id=user_id)

    current_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    prompt = _FIT_ASSESS_PROMPT.format(
        current_date=current_date,
        master_data_json=json.dumps(master_data, ensure_ascii=False, indent=2),
        requirements_json=json.dumps(requirements, ensure_ascii=False, indent=2),
    )

    raw = await provider.chat(
        messages=[{"role": "user", "content": prompt}],
        model=model,
        temperature=temperature,
        max_tokens=4096,
    )
    if not isinstance(raw, str):
        raise ValueError("LLM fit assessment returned non-string (stream not supported)")
    text = raw.strip()

    # 提取 JSON
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            parsed = json.loads(match.group(0))
        else:
            raise ValueError(f"LLM fit assessment returned invalid JSON: {text[:500]}")

    # 解析 LLM 输出
    global_score = float(parsed.get("global_score", 0))
    verdict = str(parsed.get("verdict", "mismatch"))
    dim_raw = parsed.get("dimensions", {})
    mapping = parsed.get("requirement_mapping", [])
    gaps = parsed.get("gaps", [])
    veto_reasons = list(parsed.get("veto_reasons", []))
    enrichment = list(parsed.get("enrichment_suggestions", []))

    # 映射到 FitDimensions（career-ops 1-5 分 → 0-1 归一化）
    # 5 维 → 5 个不同 LLM 字段，不再共享。entry_relevance 由后端独立计算。
    def _norm(key: str) -> float:
        return round(float(dim_raw.get(key, {}).get("score", 0)) / 5, 2)

    def _detail(key: str) -> str:
        return str(dim_raw.get(key, {}).get("detail", ""))

    dims = FitDimensions()
    dims.skills_fit = _norm("cv_match")
    dims.experience_depth = _norm("north_star")
    dims.domain_fit = _norm("cultural")
    dims.entry_relevance = average_relevance(selected, requirements)
    dims.hard_constraints = _norm("red_flags")

    dims.details = {
        "skills_fit": _detail("cv_match"),
        "experience_depth": _detail("north_star"),
        "domain_fit": _detail("cultural"),
        "entry_relevance": f"基于入选的 {len(selected)} 条经历的平均匹配度计算（后端打分，非 LLM）。",
        "hard_constraints": _detail("red_flags"),
    }

    # 收集 matched / gaps
    overall_matched: list[str] = []
    overall_gaps: list[str] = []
    for m in mapping:
        jd_req = str(m.get("jd_req", ""))
        match_status = str(m.get("match", ""))
        if match_status == "strong" and jd_req:
            overall_matched.append(jd_req)
        elif match_status == "gap" and jd_req:
            overall_gaps.append(jd_req)

    # 从 gaps 生成 enrichment
    for g in gaps:
        mitigation = str(g.get("mitigation", ""))
        if mitigation:
            enrichment.append(mitigation)

    # veto 判定
    veto = verdict == "mismatch" or global_score < 3.5
    if not veto_reasons and veto:
        veto_reasons.append(f"整体契合度过低（{global_score}/5.0），不建议投递")

    return FitAssessment(
        dimensions=dims,
        veto=veto,
        veto_reasons=veto_reasons,
        enrichment_suggestions=enrichment,
        pass_suggestions=[],
        overall_matched=sorted(set(overall_matched)),
        overall_gaps=sorted(set(overall_gaps)),
    )

