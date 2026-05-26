import type { JsonResume } from '../../api/types'
import { renderResumeBody, wrapDocument } from '../shared/utils'

export function render(resume: JsonResume, lineHeight = '1.7'): string {
  return wrapDocument(renderResumeBody(resume), resume.basics.name, THEME_CSS, lineHeight)
}

const THEME_CSS = `
body { background: #f3f4f6; }
.resume-page { border-top: 5px solid #1f2937; }
h1 { font-size: 24px; font-weight: 700; text-align: center; margin: 0 0 8px 0; color: #111827; letter-spacing: 0.05em; }
.contact-line { text-align: center; font-size: 13px; color: #4b5563; margin-bottom: 14px; }
.summary { text-align: center; color: #4b5563; margin-bottom: 16px; font-size: 13.5px; }
h2 { font-size: 15px; font-weight: 700; margin: 20px 0 10px 0; padding-bottom: 5px; border-bottom: 2px solid #1f2937; color: #1f2937; }
h3 { font-size: 14px; font-weight: 600; margin: 12px 0 6px 0; color: #374151; }
.section-item { margin-bottom: 12px; }
`
