"""Resume raw_text → structured HTML renderer.

Uses heuristic keyword matching to identify resume sections and render
semantic HTML suitable for TipTap editing. No LLM dependency — fast and
deterministic.
"""

import re

# Section header keywords (Chinese + English)
_SECTION_PATTERNS = [
    ("profile", r"^(基本信息|个人资料|个人信息|自我评价|个人简介|Profile|Summary|About\s*Me)\s*[:：]?$"),
    ("education", r"^(教育背景|教育经历|学历|Education|Academic)\s*[:：]?$"),
    ("experience", r"^(工作经历|工作经验|职业经历|Work Experience|Employment|Experience)\s*[:：]?$"),
    ("projects", r"^(项目经历|项目经验|Projects|Project Experience)\s*[:：]?$"),
    ("skills", r"^(技能|技术栈|专业技能|职业技能|Skills|Technical Skills|Skill Set)\s*[:：]?$"),
    ("certificates", r"^(证书|认证|资格证书|Certificates|Certifications)\s*[:：]?$"),
    ("languages", r"^(语言能力|语言|Languages)\s*[:：]?$"),
]

# Pre-compiled regexes
_SECTION_RES = [(key, re.compile(pat, re.I)) for key, pat in _SECTION_PATTERNS]

# Contact info patterns
_PHONE_RE = re.compile(r"(?:电话|手机|Tel|Phone)[:：]?\s*([\d\-\s+()]+)")
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
_URL_RE = re.compile(r"https?://[^\s]+")

# List item markers
_LIST_MARKER_RE = re.compile(r"^[\s]*[•·\-\*・]\s+")
_NUMBER_LIST_RE = re.compile(r"^[\s]*\d+[.．、)]\s+")


def _escape_html(text: str) -> str:
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;"))


def _detect_section(line: str) -> str | None:
    stripped = line.strip()
    for key, pattern in _SECTION_RES:
        if pattern.match(stripped):
            return key
    return None


def _is_list_item(line: str) -> bool:
    return bool(_LIST_MARKER_RE.match(line) or _NUMBER_LIST_RE.match(line))


def _strip_list_marker(line: str) -> str:
    return _LIST_MARKER_RE.sub("", _NUMBER_LIST_RE.sub("", line))


def _is_empty_line(line: str) -> bool:
    return not line.strip()


def render_resume_html(raw_text: str) -> str:
    """Convert plain resume text into semantic HTML for editing.

    Output structure:
      <div class="resume-content">
        <div class="resume-section" data-section="profile">
          <h2>基本信息</h2>
          <p>...</p>
        </div>
        ...
      </div>
    """
    if not raw_text:
        return '<div class="resume-content"><p></p></div>'

    lines = raw_text.replace("\r\n", "\n").replace("\r", "\n").split("\n")

    # First pass: tag each line
    tagged: list[tuple[str, str]] = []  # (type, content)
    for line in lines:
        sec = _detect_section(line)
        if sec:
            tagged.append(("section", sec))
            # Also keep the original text as display title if it's not pure keyword
            display = line.strip().rstrip(":：")
            tagged.append(("section_title", display))
            continue
        if _is_empty_line(line):
            tagged.append(("empty", ""))
            continue
        if _is_list_item(line):
            tagged.append(("list_item", _strip_list_marker(line).strip()))
            continue
        tagged.append(("paragraph", line.strip()))

    # Second pass: group into sections and lists
    sections: list[tuple[str, list[str]]] = []
    current_section = "profile"
    current_body: list[str] = []
    current_list: list[str] | None = None

    def flush_list():
        nonlocal current_list
        if current_list:
            items = "".join(f"<li>{_escape_html(item)}</li>" for item in current_list)
            current_body.append(f"<ul>{items}</ul>")
            current_list = None

    def flush_section():
        flush_list()
        if current_body:
            sections.append((current_section, current_body))

    i = 0
    while i < len(tagged):
        typ, content = tagged[i]
        if typ == "section":
            flush_section()
            current_section = content
            current_body = []
            i += 1
            # skip the section_title line if next is title
            if i < len(tagged) and tagged[i][0] == "section_title":
                current_body.append(f'<h2>{_escape_html(tagged[i][1])}</h2>')
                i += 1
            continue
        if typ == "section_title":
            current_body.append(f'<h2>{_escape_html(content)}</h2>')
            i += 1
            continue
        if typ == "empty":
            flush_list()
            i += 1
            continue
        if typ == "list_item":
            if current_list is None:
                current_list = []
            current_list.append(content)
            i += 1
            continue
        if typ == "paragraph":
            flush_list()
            # Merge consecutive paragraph lines if not separated by empty line
            para_lines = [content]
            j = i + 1
            while j < len(tagged):
                nxt_typ, nxt_content = tagged[j]
                if nxt_typ == "paragraph":
                    para_lines.append(nxt_content)
                    j += 1
                elif nxt_typ == "empty":
                    j += 1
                    break
                else:
                    break
            para_text = " ".join(para_lines)
            # Detect contact info
            cls = ""
            if _EMAIL_RE.search(para_text) or _PHONE_RE.search(para_text) or _URL_RE.search(para_text):
                cls = ' class="contact-info"'
            current_body.append(f"<p{cls}>{_escape_html(para_text)}</p>")
            i = j
            continue
        i += 1

    flush_section()

    # If no sections detected, wrap everything in a generic body
    if not sections:
        escaped = _escape_html(raw_text)
        paragraphs = " ".join(f"<p>{p}</p>" for p in escaped.split("\n\n") if p.strip())
        return f'<div class="resume-content">{paragraphs or "<p></p>"}</div>'

    html_parts = ['<div class="resume-content">']
    for sec_key, body in sections:
        body_html = "\n".join(body)
        html_parts.append(f'  <div class="resume-section" data-section="{sec_key}">')
        html_parts.append(body_html)
        html_parts.append("  </div>")
    html_parts.append("</div>")
    return "\n".join(html_parts)
