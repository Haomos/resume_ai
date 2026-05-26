"""Heuristic structured data extractor from resume plain text.

Phase 5 §8.36: Output is now JSON Resume schema (jsonresume.org/schema/) plus
two ``basics`` extensions (``desiredSalary`` / ``desiredLocation``) for the
resume-AI scoring framework. The legacy heuristic regex pipeline is kept as
private helpers; ``extract_structured_json`` returns the new schema.

The legacy output (``basic_info`` / ``work_experience`` / ad-hoc fields) is
no longer exposed publicly. If anything still needs it, call
``_extract_legacy_dict`` and feed it through ``legacy_to_json_resume``.
"""

import re

from .json_resume_transformer import legacy_to_json_resume

_DATE_RE = re.compile(r"(19\d{2}|20\d{2})\s*年\s*(0?\d{1,2}|)\s*[月\s]*\s*[-–—~至/]\s*(20\d{2}|19\d{2}|至今|现在|今)")
_PHONE_RE = re.compile(r"(?:电话|手机|Tel|Phone)[:：]?\s*([\d\-\s+()]{7,20})", re.I)
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
_URL_RE = re.compile(r"https?://[^\s]+")

_EDU_KEYWORDS = ["大学", "学院", "研究所", "研究院", "中专", "高中", "硕士", "博士", "本科", "专科", "大专", "MBA", "EMBA"]
_DEGREE_KEYWORDS = ["本科", "硕士", "博士", "专科", "大专", "研究生", "学士", "双学位"]
_SCHOOL_KEYWORDS = ["大学", "学院", "研究所", "研究院", "中专", "高中"]  # §8.41: 仅校名锚点用，与 _EDU_KEYWORDS（含学位词）分开

_SECTION_HEADERS = {
    "教育": "education", "学历": "education",
    "工作": "work_experience", "经历": "work_experience", "实习": "work_experience",
    "项目": "projects",
    "技能": "skills", "技术栈": "skills",
    "语言": "languages", "证书": "certificates",
    "自我评价": "summary", "个人简介": "summary",
}

def _detect_sections(lines):
    sections = {k: [] for k in _SECTION_HEADERS.values()}
    sections["other"] = []
    current = "other"
    for line in lines:
        stripped = line.strip()
        if not stripped: continue
        for kw, sec_key in _SECTION_HEADERS.items():
            if kw in stripped and len(stripped) <= 20:
                current = sec_key
                break
        else:
            sections[current].append(stripped)
    return sections

def _extract_education(lines):
    """Block-based education parser (§8.41 fix + §8.55 dual-degree fix).

    Bug fixed: the previous line-scanning logic created one entry per line that
    contained any EDU keyword. A single education with two lines (school name +
    "本科 · 车辆工程") became two entries. Combined with the date branch, the
    same education could spawn three entries.

    New approach: anchor on **school name** (line contains 大学/学院/研究所/
    研究院/中专/高中). Each school anchor opens a new entry. Following lines
    that look like degree+major or a date are merged into the open entry until
    the next school anchor or until we leave the section.

    §8.55 follow-up: a single school anchor can host two consecutive degree
    blocks (e.g. "清华大学 / 本科 计算机 / 2014-2018 / 硕士 AI / 2018-2021").
    When we encounter a second degree line while the current entry already has
    one, we flush the current entry (cloning the school name) and open a fresh
    block for the new degree. Same goes for a new period showing up after the
    period slot is filled — we treat it as a date for the second degree if a
    second degree was just opened.

    Limitations (acceptable v1):
    - If degree+major appears before the school anchor, it is dropped.
    - If two degrees are interleaved on the same line ("本科 计算机 / 硕士 AI"),
      only the first wins (this is an unusual layout and we'd need a real
      grammar to disambiguate).
    """
    results = []
    current = None  # in-progress entry dict, or None

    for line in lines:
        is_school = any(k in line for k in _SCHOOL_KEYWORDS) and len(line) < 40
        is_degree = any(k in line for k in _DEGREE_KEYWORDS) and len(line) < 40
        date_match = _DATE_RE.search(line)

        if is_school:
            # New education block — flush previous if any
            if current is not None:
                results.append(current)
            current = {"school": line, "degree": "", "major": "", "period": ""}
            # School line itself may also contain degree / period (e.g. inlined)
            for deg in _DEGREE_KEYWORDS:
                if deg in line:
                    current["degree"] = deg
                    break
            if date_match:
                current["period"] = date_match.group(0)
                current["school"] = current["school"].replace(date_match.group(0), "").strip()
            continue

        if current is None:
            # No open block — degree/date fragments without a school anchor are ignored
            continue

        if is_degree:
            # §8.55: if the open block already has a degree, this is a second
            # degree under the same school → flush current and open a new entry
            # carrying over the school name. Date slot is left blank because a
            # following date line will fill it for this new entry.
            if current["degree"]:
                school_name = current["school"]
                results.append(current)
                current = {"school": school_name, "degree": "", "major": "", "period": ""}
            # Merge degree + major into the open block
            for deg in _DEGREE_KEYWORDS:
                if deg in line:
                    current["degree"] = current["degree"] or deg
                    rest = line.replace(deg, "").strip(" ·-、，,/")
                    if rest and not current["major"]:
                        current["major"] = rest
                    break
        elif date_match:
            # Merge period if not yet set
            if not current["period"]:
                current["period"] = date_match.group(0)
        # Other lines (descriptive text inside a section) are ignored

    if current is not None:
        results.append(current)
    return results

def _extract_work_experience(lines):
    results = []
    i = 0
    while i < len(lines):
        line = lines[i]
        date_match = _DATE_RE.search(line)
        if date_match:
            period = date_match.group(0)
            company = ""
            position = ""
            description = ""
            if i > 0 and len(lines[i-1]) < 30: company = lines[i-1]
            if i + 1 < len(lines) and len(lines[i+1]) < 20:
                position = lines[i+1]
                i += 1
            desc_lines = []
            j = i + 1
            while j < len(lines):
                if _DATE_RE.search(lines[j]) or (lines[j].strip() and len(lines[j].strip()) < 15 and any(k in lines[j] for k in ["公司", "集团", "科技", "有限"])):
                    break
                desc_lines.append(lines[j])
                j += 1
            if desc_lines: description = " ".join(desc_lines)
            results.append({"company": company, "position": position, "period": period, "description": description})
        i += 1
    return results

def _extract_projects(lines):
    results = []
    i = 0
    while i < len(lines):
        line = lines[i]
        date_match = _DATE_RE.search(line)
        if date_match:
            period = date_match.group(0)
            name = ""
            tech_stack = ""
            description = ""
            if i > 0 and len(lines[i-1]) < 40: name = lines[i-1]
            if i + 1 < len(lines) and ("技术栈" in lines[i+1] or ":" in lines[i+1] or "，" in lines[i+1]):
                tech_stack = lines[i+1]
                i += 1
            desc_lines = []
            j = i + 1
            while j < len(lines):
                if _DATE_RE.search(lines[j]): break
                desc_lines.append(lines[j])
                j += 1
            if desc_lines: description = " ".join(desc_lines)
            results.append({"name": name, "period": period, "tech_stack": tech_stack, "description": description})
        i += 1
    return results

def _extract_skills(lines):
    all_text = " ".join(lines)
    skills = []
    for match in re.finditer(r"(?:技能|技术栈| Skills?)[:：]\s*([^\n]+)", all_text, re.I):
        part = match.group(1)
        for sep in [",", "，", "/", "、", " ", "|"]:
            if sep in part:
                skills.extend([s.strip() for s in part.split(sep) if s.strip() and len(s.strip()) < 30])
                break
    seen = set()
    unique = []
    for s in skills:
        key = s.lower()
        if key not in seen:
            seen.add(key)
            unique.append(s)
    return unique[:50]

def _extract_basic_info(text):
    info = {"name": "", "phone": "", "email": "", "url": ""}
    phone_match = _PHONE_RE.search(text)
    if phone_match: info["phone"] = phone_match.group(1).strip()
    email_match = _EMAIL_RE.search(text)
    if email_match: info["email"] = email_match.group(0).strip()
    url_match = _URL_RE.search(text)
    if url_match: info["url"] = url_match.group(0).strip()
    lines = text.strip().splitlines()
    for line in lines[:5]:
        stripped = line.strip()
        if 2 <= len(stripped) <= 15 and not re.search(r"[\d@:/]", stripped):
            info["name"] = stripped
            break
    return info

def _extract_legacy_dict(raw_text):
    """Internal: produce the old ad-hoc legacy schema (kept for transformer input)."""
    if not raw_text: return {}
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    sections = _detect_sections(lines)
    result = {}
    result["basic_info"] = _extract_basic_info(raw_text)
    result["education"] = _extract_education(sections.get("education", lines))
    if not result["education"]: result["education"] = _extract_education(lines)
    result["work_experience"] = _extract_work_experience(sections.get("work_experience", lines))
    if not result["work_experience"]: result["work_experience"] = _extract_work_experience(lines)
    result["projects"] = _extract_projects(sections.get("projects", lines))
    if not result["projects"]: result["projects"] = _extract_projects(lines)
    result["skills"] = _extract_skills(sections.get("skills", lines))
    if not result["skills"]: result["skills"] = _extract_skills(lines)
    result["languages"] = []
    result["certificates"] = []
    return result


def extract_structured_json(raw_text):
    """Extract structured resume data as JSON Resume schema.

    Phase 5 §8.36: returns JSON Resume v1.0.0 (with resume-AI extensions).
    See ``json_resume_transformer.py`` for schema details.
    """
    return legacy_to_json_resume(_extract_legacy_dict(raw_text))
