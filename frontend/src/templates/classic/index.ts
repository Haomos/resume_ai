import type { JsonResume } from '../../api/types'
import { renderResumeBody, wrapDocument } from '../shared/utils'

export function render(resume: JsonResume, lineHeight = '1.7'): string {
  return wrapDocument(renderResumeBody(resume), resume.basics.name, THEME_CSS, lineHeight)
}

const THEME_CSS = `
body { background: #f5f5f0; }
.resume-page { padding: 8mm 20mm 20mm; background: #fff; font-family: "Songti SC", "STSong", "SimSun", "宋体", "Times New Roman", serif; }
h1 { font-size: 28px; font-weight: 400; text-align: center; margin: 0 0 6px 0; color: #000; letter-spacing: 0.2em; padding-bottom: 8px; border-bottom: 1px solid #000; }
.contact-line { text-align: center; font-size: 13px; color: #333; margin-bottom: 12px; }
.summary { text-align: center; color: #333; margin-bottom: 16px; font-size: 13.5px; }
h2 { font-size: 16px; font-weight: 700; margin: 22px 0 10px 0; padding: 4px 12px; color: #fff; background: #1c1c1c; display: inline-block; letter-spacing: 0.08em; }
h3 { font-size: 14px; font-weight: 700; margin: 14px 0 6px 0; color: #1c1c1c; padding-left: 8px; border-left: 3px solid #1c1c1c; }
p { color: #262626; }
strong { color: #000; }
.section-item { margin-bottom: 12px; }
`
