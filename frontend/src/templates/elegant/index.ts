import type { JsonResume } from '../../api/types'
import { renderResumeBody, wrapDocument } from '../shared/utils'

export function render(resume: JsonResume, lineHeight = '1.7'): string {
  return wrapDocument(renderResumeBody(resume), resume.basics.name, THEME_CSS, lineHeight)
}

const THEME_CSS = `
body { background: #f5f1ea; }
.resume-page { padding: 24mm 22mm; background: #fdfcf8; font-family: "Georgia", "Times New Roman", "Songti SC", serif; color: #2c2417; }
.resume-page::before { content: ""; display: block; height: 3px; width: 60px; margin: 0 auto 18px auto; background: #c9a961; }
h1 { font-size: 30px; font-weight: 700; text-align: center; margin: 0 0 6px 0; color: #1f1a0d; letter-spacing: 0.04em; }
.contact-line { text-align: center; font-size: 13px; color: #5c4d2e; margin-bottom: 14px; }
.summary { text-align: center; color: #4a3f28; margin-bottom: 18px; font-size: 14px; font-style: italic; }
h2 { font-size: 12px; font-weight: 500; margin: 26px 0 12px 0; padding: 0; color: #8a6d2a; text-transform: uppercase; letter-spacing: 0.25em; border-top: 1px solid #c9a961; border-bottom: 1px solid #c9a961; padding: 6px 0; }
h3 { font-size: 14px; font-weight: 700; margin: 14px 0 4px 0; color: #1f1a0d; font-style: italic; }
p { color: #3d3324; }
strong { color: #1f1a0d; }
a { color: #8a6d2a; text-decoration: none; border-bottom: 1px dotted #c9a961; }
.section-item { margin-bottom: 12px; }
`
