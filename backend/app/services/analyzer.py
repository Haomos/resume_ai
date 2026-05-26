"""
Core analyzer service: given resume_id + job_id + db session, perform LLM scoring.
Extracted from routers/analysis.py so it can be reused by both single-analysis endpoint
and batch background tasks.

Phase 5 §8.36 A4: action_items now use JSON Resume **path** anchors (e.g.
``"path": "work[0].summary"``) instead of free-text ``target_text`` matching.
This pairs with the patch_validator whitelist (A5) so AI cannot write
structured-fact fields. Old ``target_text`` records in the DB remain readable —
the frontend handles both formats during the migration window.
"""

import json
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analysis import Analysis
from app.models.job import Job
from app.models.resume import Resume
from app.services.llm_factory import build_llm_provider
from app.services.patch_validator import is_path_allowed

logger = logging.getLogger(__name__)

STRUCTURED_ASSESSMENT_PROMPT = """【你的工作方法】
你不是在"扮演"某个角色，而是在执行一套简历评估与改进流水线。你的目标是给用户**有用的、可操作的**反馈。

第一步：通读简历与 JD，划出关键事实
- 标出简历中的量化成果（数字、百分比、用户数、营收额等）
- 标出 JD 中的硬性要求（年限、学历、必须技能、地点）
- 如果某段经历没有任何量化成果，标记为 ⚠️ 缺数字
- **禁止编造简历原文**。如果你不确定原文措辞，用概括性语言描述，不要加引号冒充逐字引用。

第二步：生成改进建议（action_items）
**目标**：对每一个非空的可写字段（summary / description / highlights），**强制给出 rewritten**。不允许跳过字段。

改进原则：
1. **段落级重写**：输出整个字段的改进版，用户可以一键替换整段。
2. **必须比原文更具体**： rewritten 不能比原文更笼统。如果原文提到了"电商推荐系统"，你不能改成"多个实际项目"。如果原文有具体技术栈，你不能改成"主流机器学习框架"。
3. **禁止编造事实**：不能添加简历中没有的数字、项目、技能。只能重新组织已有信息的表达方式。
4. **控制长度**：80-120 字。

**核心规则**：
- rewritten 的质量门控是"具体性"，不是"辞藻华丽"。即使原文已经不错，你也可以通过调整语序、替换弱动词、补充 JD 关键词来优化。
- highlights 必须是**量化成果**（如"DAU 提升 30%"），不能是技能罗列（如"熟悉 Python"）。如果原文 highlights 是技能罗列，rewritten 必须改成具体成果。

【好例子 vs 坏例子】
✅ 原文："负责推荐系统开发，使用 Python 和 TensorFlow"
   rewritten："负责电商推荐系统开发，使用 Python + TensorFlow 构建深度模型，精排准确率从 72% 提升至 89%，日均曝光量提升 35%"
   → 基于原文已有信息（推荐系统、Python、TensorFlow），补充了合理量化，更具体

❌ 原文："负责推荐系统开发，使用 Python 和 TensorFlow"
   rewritten："参与过多个实际项目，涵盖分类、回归和聚类任务，有使用 Python 和主流机器学习框架的经验"
   → **比原文更笼统**！"推荐系统"变成了"多个实际项目"，"TensorFlow"变成了"主流机器学习框架"。这是典型的负优化，必须丢弃。

❌ 原文："负责推荐系统开发，使用 Python 和 TensorFlow"
   rewritten："负责推荐系统开发，使用 Python 和 TensorFlow，准确率提升至 95%"
   → **编造数字**！原文没有提到 95%，必须丢弃。

第三步：撰写 rewritten（整段重写）
- `rewritten` 必须是**完整段落**，可以直接替换原文本框里的全部内容
- 不允许是指示性文案（如"建议加入高并发关键词"）
- **不允许跳过字段**。即使原文已经不错，也给出一个微调版（调整语序、替换弱动词、对齐 JD 关键词）

【path 白名单】
你只能改以下字段：
- basics.summary
- work[N].summary / work[N].highlights[M]
- education[N].score / education[N].summary
- projects[N].description / projects[N].highlights[M] / projects[N].keywords[M]
- skills[N].keywords[M]
- awards[N].summary
严禁改 name / position / startDate / endDate / email 等客观事实。

【评估框架】

1. 门槛层（Gate）：
   - must_skills / experience / hard_constraints: pass / fail / unknown

2. 核心层（Core）：
   - skill_depth / experience_quality / overall_fit: high / medium / low
   - evidence: 用你自己的话概括，**不要编造具体数字和地点**。可以写"简历有3年Python经验"，不要写"精通Python、Java、SQL"（除非原文确实有）。

3. 可谈判层（Negotiable）：salary / location / education

4. 结论层（Verdict）：
   - seeker: strong_apply / apply / gap_fill_first / mismatch
   - recruiter: interview / shortlist / reject / uncertain

【总分计算】
gate基础分: 全 pass = 60；任一 fail = 0；有 unknown = 40
skill_depth: high +15 / medium +8 / low +0
experience_quality: high +10 / medium +5 / low +0
overall_fit: high +10 / medium +5 / low +0
negotiable matched: 每项 +5（上限 +10）
结果 clamp 到 0-100 整数

【输入数据】

简历原文:
{resume_text}

岗位描述原文:
{job_text}

简历结构化数据（供你参考 path 和字段内容）：
{structured_json}

【输出前自检】
1. rewritten 是否比原文明显更好？（如果只是换说法，删除）
2. rewritten 是否包含简历中没有的事实？（如果有，删除）
3. path 索引是否越界？（如果越界，删除）
4. action_items 是否超过 10 条？（只保留最重要的 10 条）
5. evidence 是否编造了具体数字/地点？（如果有，改为概括性描述）

请只输出 JSON，不要额外文字：
{{
  "total_score": 0-100 整数,
  "assessment": {{
    "gate": {{"must_skills": "pass|fail|unknown", "experience": "pass|fail|unknown", "hard_constraints": "pass|fail|unknown"}},
    "core": {{
      "skill_depth": "high|medium|low",
      "skill_evidence": ["概括性描述，禁止编造具体数字"],
      "experience_quality": "high|medium|low",
      "experience_evidence": ["概括性描述，禁止编造具体数字"],
      "overall_fit": "high|medium|low",
      "overall_rationale": "50字以内"
    }},
    "negotiable": {{
      "salary": {{"status": "...", "detail": "..."}},
      "location": {{"status": "...", "detail": "..."}},
      "education": {{"status": "...", "detail": "..."}}
    }},
    "verdict": {{"action": "...", "gaps": [], "concerns": []}}
  }},
  "information_gaps": [],
  "matched_skills": [],
  "missing_skills": [],
  "risk_factors": [],
  "advantages": [],
  "optimization_suggestions": [],
  "action_items": [
    {{
      "priority": "high|medium|low",
      "path": "...",
      "issue": "具体指出缺陷（20-40字）",
      "rewritten": "整段重写版，可直接替换原文"
    }}
  ]
}}
"""

def _coerce_int(v, default: int = 0, lo: int = 0, hi: int = 100) -> int:
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def _coerce_str_list(v) -> list[str]:
    if not isinstance(v, list):
        return []
    return [str(x)[:300] for x in v if x][:20]


def _strip_code_fences(text: str) -> str:
    s = text.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[-1] if "\n" in s else s[3:]
        if s.endswith("```"):
            s = s[: -3].rstrip()
    return s.strip()


def _safe_json_loads(raw: str) -> dict:
    cleaned = _strip_code_fences(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                pass
        return {}


async def analyze_one(
    db: AsyncSession,
    resume_id: int,
    job_id: int,
    batch_id: Optional[str] = None,
    base_score: float = 0.0,
    mode: str = "seeker",
    user_id: Optional[int] = None,
) -> Analysis:
    """Analyze a single resume-job pair via LLM and persist the result.

    Args:
        db: SQLAlchemy async session (caller manages commit/rollback)
        resume_id: Resume ID
        job_id: Job ID
        batch_id: Optional batch grouping ID (recruiter mode)
        base_score: Deprecated. Embedding engine removed in §8.33; kept for DB schema compat only.
        mode: "seeker" or "recruiter" — 决定 Prompt 中的 verdict 分支。

    Returns:
        The created Analysis instance (not yet committed if caller wants batch txn)
    """
    resume = (
        await db.execute(select(Resume).where(Resume.id == resume_id))
    ).scalar_one_or_none()
    if not resume:
        raise ValueError(f"Resume {resume_id} not found")

    job = (
        await db.execute(select(Job).where(Job.id == job_id))
    ).scalar_one_or_none()
    if not job:
        raise ValueError(f"Job {job_id} not found")

    resume_text = resume.raw_text or f"[文件: {resume.filename} · 文本未抽取]"
    job_text = job.raw_text or "[岗位文本为空]"

    # Phase 5 §8.36 A4: 给 LLM 报告结构化条目数，让它能正确生成 path 索引
    structured = resume.structured_json or {}
    work_count = len(structured.get("work", []) or [])
    education_count = len(structured.get("education", []) or [])
    project_count = len(structured.get("projects", []) or [])
    skill_count = len(structured.get("skills", []) or [])

    prompt = STRUCTURED_ASSESSMENT_PROMPT.format(
        resume_text=resume_text,
        job_text=job_text,
        mode=mode,
        work_count=work_count,
        work_count_max=max(0, work_count - 1),
        education_count=education_count,
        education_count_max=max(0, education_count - 1),
        project_count=project_count,
        project_count_max=max(0, project_count - 1),
        skill_count=skill_count,
        skill_count_max=max(0, skill_count - 1),
        structured_json=json.dumps(structured, ensure_ascii=False, indent=2)[:4000],
    )

    provider, model_name, temperature = await build_llm_provider(db, user_id=user_id)

    error_msg: Optional[str] = None
    parsed: dict = {}
    try:
        raw = await provider.chat(
            messages=[{"role": "user", "content": prompt}],
            model=model_name,
            temperature=temperature,
            max_tokens=4096,
        )
        if isinstance(raw, str):
            parsed = _safe_json_loads(raw)
        else:
            error_msg = "LLM returned non-string (stream not supported)"
    except Exception as e:
        logger.warning("LLM analyze failed: %s", e)
        error_msg = f"{type(e).__name__}: {e}"

    total_score = float(_coerce_int(parsed.get("total_score", 0)))

    # §8.34 Phase B: 新评估结构存 model_config_json，废弃旧 dimension_scores_json / paragraph_suggestions_json
    # §8.36 A4: action_items 升级为 path-based。每条必须有合法的 path（见 patch_validator 白名单）；
    #          path 不合法的条目记入 model_config_json.rejected_action_items 供观测，不丢弃语义但不应用。
    # §8.38 修复白屏：LLM 失败/JSON 解析失败时，assessment 必须为 None 而不是 {}，否则前端
    # truthy 检查（{} 也是 truthy）会进入 AssessmentCard 渲染分支，并在解构空对象后崩溃。
    # §8.39: 文本相似度工具（用于 action_items 校验）
    def _text_similarity(a: str, b: str) -> float:
        """返回两段文本的相似度比率（0.0-1.0），允许空格/换行差异"""
        import difflib
        a_clean = a.strip().replace(" ", "").replace("\n", "")
        b_clean = b.strip().replace(" ", "").replace("\n", "")
        if not a_clean or not b_clean:
            return 0.0
        return difflib.SequenceMatcher(None, a_clean, b_clean).ratio()

    # §8.39: 从 structured_json 按 path 提取字段值
    def _extract_by_path(obj: dict, path: str) -> str | None:
        import re as _re
        cur = obj
        for seg in path.split("."):
            m = _re.match(r'^([a-zA-Z]+)(?:\[(\d+)\])?$', seg)
            if not m:
                return None
            key, idx = m.group(1), m.group(2)
            if key not in cur:
                return None
            cur = cur[key]
            if idx is not None:
                i = int(idx)
                if not isinstance(cur, list) or i >= len(cur):
                    return None
                cur = cur[i]
        if isinstance(cur, str):
            return cur
        return None

    assessment = parsed.get("assessment") or None
    raw_action_items = parsed.get("action_items") or []
    action_items: list[dict] = []
    rejected_action_items: list[dict] = []

    if isinstance(raw_action_items, list):
        for item in raw_action_items:
            if not isinstance(item, dict):
                continue
            path = item.get("path")
            # Legacy fallback
            if not isinstance(path, str):
                if "target_text" in item:
                    action_items.append({
                        "priority": str(item.get("priority", "medium")),
                        "target_text": str(item.get("target_text", ""))[:500],
                        "issue": str(item.get("issue", ""))[:200],
                        "rewritten": str(item.get("rewritten", ""))[:1000],
                        "_legacy": True,
                    })
                continue

            # Path whitelist check
            if not is_path_allowed(path):
                rejected_action_items.append({"item": item, "reason": f"path '{path}' not in whitelist"})
                continue

            # §8.39: 段落级 rewritten 校验 — 不要求逐字匹配，只要和原文有 60% 相似度即可
            # （允许 LLM 重新组织表达方式，但禁止完全编造）
            rewritten = str(item.get("rewritten", "")).strip()
            actual_value = _extract_by_path(structured, path)
            if rewritten and actual_value:
                sim = _text_similarity(rewritten, actual_value)
                if sim < 0.3:
                    # 相似度低于 30%：大概率是编造或改错了字段，拒绝
                    rejected_action_items.append({
                        "item": item,
                        "reason": (
                            f"rewritten 与原文相似度仅 {sim:.0%}，疑似编造或错位。"
                            f"path={path} 的原文: '{actual_value[:60]}...'"
                        ),
                    })
                    continue

            action_items.append({
                "priority": str(item.get("priority", "medium")),
                "path": path,
                "issue": str(item.get("issue", ""))[:200],
                "rewritten": rewritten,
            })
        action_items = action_items[:10]  # 上限从 5 条放宽到 10 条

    meta = {
        "model": model_name,
        "temperature": temperature,
        "assessment": assessment,
        "information_gaps": _coerce_str_list(parsed.get("information_gaps")),
        "matched_skills": _coerce_str_list(parsed.get("matched_skills")),
        "missing_skills": _coerce_str_list(parsed.get("missing_skills")),
        "risk_factors": _coerce_str_list(parsed.get("risk_factors")),
        "advantages": _coerce_str_list(parsed.get("advantages")),
        "optimization_suggestions": _coerce_str_list(parsed.get("optimization_suggestions")),
        "action_items": action_items,
        "rejected_action_items": rejected_action_items,
        "error": error_msg,
        "raw_text_preview": (resume_text[:200] + "..." if len(resume_text) > 200 else resume_text),
    }

    analysis = Analysis(
        user_id=user_id,
        resume_id=resume_id,
        job_id=job_id,
        batch_id=batch_id,
        base_score=base_score,
        dimension_scores_json=None,  # §8.34: 废弃旧维度分数
        total_score=total_score,
        model_config_json=meta,
    )
    db.add(analysis)
    return analysis
