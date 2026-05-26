import type { JsonResume } from '../../api/types'
import { renderResumeBody, wrapDocument } from '../shared/utils'

export function render(resume: JsonResume, lineHeight = '1.7'): string {
  return wrapDocument(renderResumeBody(resume), resume.basics.name, THEME_CSS, lineHeight)
}

const THEME_CSS = `
body { background: #f8fafc; }
.resume-page { background: linear-gradient(to bottom, #f8fafc 0%, #ffffff 12%); padding: 6mm 20mm 20mm; border-radius: 2px; }
h1 { font-size: 26px; font-weight: 800; color: #0f172a; margin: 0 0 16px 0; letter-spacing: -0.02em; }
.contact-line { font-size: 13px; color: #64748b; margin-bottom: 14px; text-align: center; }
.summary { text-align: center; color: #475569; margin-bottom: 16px; font-size: 13.5px; }
h2 { font-size: 13px; font-weight: 700; margin: 18px 0 10px 0; padding: 6px 14px; background: #1e293b; color: #ffffff; border-radius: 4px; display: inline-block; letter-spacing: 0.02em; }
h3 { font-size: 13px; font-weight: 600; margin: 10px 0 6px 0; color: #334155; }
strong { color: #0f172a; font-weight: 700; }
a { color: #2563eb; }
.section-item { margin-bottom: 12px; }
`
