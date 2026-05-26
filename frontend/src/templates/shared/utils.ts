import type { JsonResume, ResumeBasics, ResumeWork, ResumeEducation, ResumeProject, ResumeSkill } from '../../api/types'

export function escHtml(text: unknown): string {
  const s = text == null ? '' : String(text)
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 轻量 Markdown → HTML（简历场景专用）
 * 支持：**bold**、*italic*、\`code\`、[text](url)、# heading、- list、1. list
 */
export function liteMarkdownToHtml(text: string): string {
  const lines = text.split('\n')
  const out: string[] = []
  let inUl = false
  let inOl = false

  const closeList = () => {
    if (inUl) { out.push('</ul>'); inUl = false }
    if (inOl) { out.push('</ol>'); inOl = false }
  }

  const parseInline = (line: string) => {
    let s = escHtml(line)
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>')
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>')
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    return s
  }

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed === '') { closeList(); continue }

    if (trimmed.startsWith('# ')) {
      closeList()
      out.push(`<h3>${parseInline(trimmed.slice(2))}</h3>`)
      continue
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inUl) { out.push('<ul>'); inUl = true }
      if (inOl) { out.push('</ol>'); inOl = false }
      out.push(`<li>${parseInline(trimmed.slice(2))}</li>`)
      continue
    }
    if (/^\d+\.\s/.test(trimmed)) {
      if (!inOl) { out.push('<ol>'); inOl = true }
      if (inUl) { out.push('</ul>'); inUl = false }
      const content = trimmed.replace(/^\d+\.\s*/, '')
      out.push(`<li>${parseInline(content)}</li>`)
      continue
    }
    closeList()
    out.push(`<p>${parseInline(lines[i])}</p>`)
  }
  closeList()
  return out.join('\n')
}

/** YYYY-MM → YYYY.MM ; YYYY → YYYY */
export function fmtDate(dateStr: unknown): string {
  const s = dateStr == null ? '' : String(dateStr)
  if (!s) return ''
  if (s.length === 4) return s
  if (s.length >= 7) return s.slice(0, 7).replace('-', '.')
  return s
}

/** 格式化时间段: 2022.03 - 2024.05 / 至今 */
export function fmtPeriod(start: unknown, end: unknown): string {
  const s = fmtDate(start)
  const e = end ? fmtDate(end) : '至今'
  if (!s) return e
  return `${s} - ${e}`
}

/** 拼装联系方式 */
export function renderContactLine(basics: ResumeBasics): string {
  const parts: string[] = []
  if (basics.email) parts.push(escHtml(basics.email))
  if (basics.phone) parts.push(escHtml(basics.phone))
  if (basics.location?.city) parts.push(escHtml(basics.location.city))
  if (basics.url) parts.push(`<a href="${escHtml(basics.url)}">${escHtml(basics.url)}</a>`)
  return parts.join(' · ')
}

/** 生成照片 HTML(如果有) */
export function renderPhoto(basics: ResumeBasics): string {
  if (!basics.image) return ''
  return `<div class="resume-photo-wrap"><img src="${escHtml(basics.image)}" alt="photo" class="resume-photo"></div>`
}

/** 生成工作经历条目 */
export function renderWorkItem(w: ResumeWork): string {
  if (!w || typeof w !== 'object') return ''
  const period = fmtPeriod(w.startDate || '', w.endDate || '')
  const header = `<h3>${escHtml(w.name || '')}<span style="float:right;font-weight:400;color:#6b7280;font-size:13px;">${escHtml(period)}</span></h3>`
  const pos = w.position ? `<p style="margin:-6px 0 6px 0;color:#374151;font-weight:600;">${escHtml(w.position)}</p>` : ''
  const summary = w.summary ? liteMarkdownToHtml(w.summary) : ''
  const highlights = Array.isArray(w.highlights) && w.highlights.length
    ? `<ul>${w.highlights.map((h: string) =>`<li>${escHtml(h || '')}</li>`).join('')}</ul>`
    : ''
  return `<div class="section-item">${header}${pos}${summary}${highlights}</div>`
}

/** 生成教育经历条目 */
export function renderEducationItem(e: ResumeEducation): string {
  if (!e || typeof e !== 'object') return ''
  const period = fmtPeriod(e.startDate || '', e.endDate || '')
  const header = `<h3>${escHtml(e.institution || '')}<span style="float:right;font-weight:400;color:#6b7280;font-size:13px;">${escHtml(period)}</span></h3>`
  const degree = [e.studyType, e.area].filter(Boolean).join(' · ')
  const sub = degree ? `<p style="margin:-6px 0 6px 0;color:#374151;">${escHtml(degree)}</p>` : ''
  const score = e.score ? `<p>GPA / 成绩: ${escHtml(e.score)}</p>` : ''
  const summary = e.summary ? liteMarkdownToHtml(e.summary) : ''
  return `<div class="section-item">${header}${sub}${score}${summary}</div>`
}

/** 生成项目条目 */
export function renderProjectItem(p: ResumeProject): string {
  if (!p || typeof p !== 'object') return ''
  const period = fmtPeriod(p.startDate || '', p.endDate || '')
  const header = `<h3>${escHtml(p.name || '')}<span style="float:right;font-weight:400;color:#6b7280;font-size:13px;">${escHtml(period)}</span></h3>`
  const desc = p.description ? liteMarkdownToHtml(p.description) : ''
  const highlights = Array.isArray(p.highlights) && p.highlights.length
    ? `<ul>${p.highlights.map((h: string) =>`<li>${escHtml(h || '')}</li>`).join('')}</ul>`
    : ''
  const keywords = Array.isArray(p.keywords) && p.keywords.length
    ? `<p style="font-size:12px;color:#6b7280;">${p.keywords.map((k: string) =>`<span style="margin-right:8px;">#${escHtml(k || '')}</span>`).join('')}</p>`
    : ''
  return `<div class="section-item">${header}${desc}${highlights}${keywords}</div>`
}

/** 生成技能条目 */
export function renderSkillItem(s: ResumeSkill): string {
  if (!s || typeof s !== 'object') return ''
  const level = s.level ? `<span style="color:#6b7280;font-size:12px;margin-left:8px;">${escHtml(s.level)}</span>` : ''
  const keywords = Array.isArray(s.keywords) && s.keywords.length
    ? `<span style="font-size:12px;color:#6b7280;margin-left:8px;">${s.keywords.map((k: string) => escHtml(k || '')).join(' · ')}</span>`
    : ''
  return `<p style="margin-bottom:4px;"><strong>${escHtml(s.name || '')}</strong>${level}${keywords}</p>`
}

/** 根据 section_order 生成简历 body HTML（所有主题复用） */
export function renderResumeBody(resume: JsonResume): string {
  const parts: string[] = []

  // Defensive: malformed structured_json can crash renderer (§8.38)
  const basics = resume?.basics || { name: '', email: '', phone: '', url: '', summary: '', location: { city: '', region: '', countryCode: '' }, profiles: [] }
  const work = Array.isArray(resume?.work) ? resume.work : []
  const education = Array.isArray(resume?.education) ? resume.education : []
  const projects = Array.isArray(resume?.projects) ? resume.projects : []
  const customSections = Array.isArray(resume?.customSections) ? resume.customSections : []

  // Header — flex 布局：头像与姓名垂直居中对齐，解决上方留白和头像位置问题
  const contact = renderContactLine(basics)
  const photoHtml = renderPhoto(basics)
  parts.push(`<div class="resume-header">`)
  parts.push(`  <div class="header-photo"${!photoHtml ? ' style="display:none"' : ''}>${photoHtml}</div>`)
  parts.push(`  <div class="header-text">`)
  parts.push(`    <h1>${escHtml(basics.name || '')}</h1>`)
  if (contact) parts.push(`    <p class="contact-line">${contact}</p>`)
  if (basics.summary) parts.push(`    <div class="summary">${liteMarkdownToHtml(basics.summary)}</div>`)
  parts.push(`  </div>`)
  parts.push(`</div>`)

  // Sections by order
  const order = resume?.meta?.section_order ?? ['work', 'education', 'projects', 'skills']
  for (const key of order) {
    switch (key) {
      case 'work':
        if (work.length) {
          parts.push(`<div class="resume-section"><h2>工作经历</h2>${work.map(renderWorkItem).join('')}</div>`)
        }
        break
      case 'education':
        if (education.length) {
          parts.push(`<div class="resume-section"><h2>教育背景</h2>${education.map(renderEducationItem).join('')}</div>`)
        }
        break
      case 'projects':
        if (projects.length) {
          parts.push(`<div class="resume-section"><h2>项目经历</h2>${projects.map(renderProjectItem).join('')}</div>`)
        }
        break
      case 'customSections':
        if (customSections.length) {
          for (const cs of customSections) {
            if (!cs.title && !cs.content) continue
            parts.push(`<div class="resume-section">`)
            if (cs.title) parts.push(`<h2>${escHtml(cs.title)}</h2>`)
            if (cs.content) parts.push(`<div class="section-item">${liteMarkdownToHtml(cs.content)}</div>`)
            parts.push(`</div>`)
          }
        }
        break
    }
  }
  return parts.join('\n')
}

export const BASE_CSS = `/* ─── Reset ─── */
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0; padding: 0;
  font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
               "WenQuanYi Micro Hei", "Noto Sans CJK SC", sans-serif;
  font-size: 14px; line-height: 1.7;
  color: #1f2937; background: #f3f4f6;
  -webkit-font-smoothing: antialiased;
  /* §8.39 CJK typography: punctuation hanging + strict line-break */
  line-break: strict;
  text-spacing-trim: trim-start;
}
@page { size: A4; margin: 15mm; }
.resume-page {
  width: 210mm; min-height: 297mm;
  margin: 4px auto; padding: 6mm 20mm 20mm;
  background: #ffffff;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
}
/* Structured defaults */
.resume-content p { margin: 0 0 8px 0; }
.resume-content ul, .resume-content ol { margin: 0 0 8px 0; padding-left: 20px; }
.resume-content li { margin-bottom: 3px; }
.resume-content a { color: #2563eb; text-decoration: none; }
.resume-content strong { font-weight: 700; }
/* Inline code support for liteMarkdown */
.resume-content code {
  font-family: "JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace;
  font-size: 0.92em;
  background: #f3f4f6;
  padding: 1px 4px;
  border-radius: 3px;
  color: #374151;
}
/* Image support */
.resume-content img { max-width: 100%; height: auto; }
/* §8.38: resume-header 用 flex 让头像中线与姓名中线对齐 */
.resume-content .resume-header {
  display: flex;
  flex-direction: row-reverse; /* 头像在右 */
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}
.resume-content .header-photo {
  flex-shrink: 0;
}
.resume-content .header-text {
  flex: 1;
}
/* 姓名/联系信息左对齐，缩小字号，去掉夸张的大标题效果 */
.resume-content .resume-header .header-text h1 {
  font-size: 20px;
  font-weight: 600;
  text-align: left;
  margin: 0 0 4px 0;
  letter-spacing: 0;
}
.resume-content .resume-header .header-text .contact-line {
  text-align: left;
  margin: 0 0 4px 0;
  font-size: 13px;
  color: #4b5563;
}
.resume-content .resume-header .header-text .summary {
  text-align: left;
  margin: 0;
  font-size: 13px;
  color: #4b5563;
}
.resume-content .resume-photo-wrap {
  margin: 0;
}
.resume-content .resume-photo-wrap .resume-photo {
  width: 80px; height: 80px; object-fit: cover;
  border-radius: 4px; display: block;
}
/* Section spacing */
.resume-section { margin-bottom: 16px; }
.section-item { margin-bottom: 12px; }
.section-item:last-child { margin-bottom: 0; }
@media print {
  * { -webkit-print-color-adjust: economy; print-color-adjust: economy; }
  body { background: #fff !important; }
  .resume-page { margin: 0; padding: 0; box-shadow: none !important; background: #fff !important; width: 100%; min-height: auto; }
}`

export function wrapDocument(bodyHtml: string, title: string, themeCss: string, lineHeight = '1.7'): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title || '简历')}</title>
<style>
${BASE_CSS.replace('line-height: 1.7;', `line-height: ${lineHeight};`)}
${themeCss}
</style>
</head>
<body>
<div class="resume-page">
  <div class="resume-content" style="line-height: ${lineHeight}">
${bodyHtml}
  </div>
</div>
</body>
</html>`
}
