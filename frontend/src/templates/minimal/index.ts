import type { JsonResume } from '../../api/types'
import { renderResumeBody, wrapDocument } from '../shared/utils'

export function render(resume: JsonResume, lineHeight = '1.7'): string {
  return wrapDocument(renderResumeBody(resume), resume.basics.name, THEME_CSS, lineHeight)
}

const THEME_CSS = `
body { background: #fafafa; }
.resume-page { padding: 10mm 26mm 26mm; background: #fff; }
h1 { font-size: 22px; font-weight: 300; color: #000; text-align: center; margin: 0 0 20px 0; letter-spacing: 0.12em; text-transform: uppercase; }
.contact-line { text-align: center; font-size: 12px; color: #525252; margin-bottom: 18px; letter-spacing: 0.04em; }
.summary { text-align: center; color: #404040; margin-bottom: 20px; font-size: 13px; }
h2 { font-size: 11px; font-weight: 400; margin: 28px 0 8px 0; color: #000; letter-spacing: 0.18em; text-transform: uppercase; border-bottom: 0.5px solid #000; padding-bottom: 4px; }
h3 { font-size: 12px; font-weight: 500; margin: 10px 0 4px 0; color: #525252; letter-spacing: 0.02em; }
p, ul, ol { margin-bottom: 14px; }
.section-item { margin-bottom: 14px; }
`
