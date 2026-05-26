import type { JsonResume } from '../../api/types'
import { renderResumeBody, wrapDocument } from '../shared/utils'

export function render(resume: JsonResume, lineHeight = '1.7'): string {
  return wrapDocument(renderResumeBody(resume), resume.basics.name, THEME_CSS, lineHeight)
}

const THEME_CSS = `
body { background: #e0f2fe; }
.resume-page { padding: 6mm 18mm 18mm; background: #ffffff; font-family: "JetBrains Mono", "Cascadia Code", "Fira Code", "Consolas", "Source Code Pro", "Microsoft YaHei", monospace; font-size: 13px; border-top: 4px solid #0ea5e9; }
h1 { font-size: 22px; font-weight: 700; text-align: center; margin: 0 0 14px 0; color: #0c4a6e; }
h1::before { content: "< "; color: #0ea5e9; }
h1::after { content: " />"; color: #0ea5e9; }
.contact-line { text-align: center; font-size: 12px; color: #0c4a6e; margin-bottom: 12px; }
.summary { text-align: center; color: #334155; margin-bottom: 14px; font-size: 13px; }
h2 { font-size: 14px; font-weight: 700; margin: 22px 0 10px 0; padding: 4px 10px 4px 12px; color: #0c4a6e; background: #f0f9ff; border-left: 4px solid #0ea5e9; }
h2::before { content: "// "; color: #94a3b8; font-weight: 400; }
h3 { font-size: 13px; font-weight: 600; margin: 12px 0 4px 0; color: #1e293b; }
h3::before { content: "▎"; color: #0ea5e9; margin-right: 4px; }
strong { color: #0369a1; }
a { color: #0284c7; text-decoration: underline; text-underline-offset: 3px; }
.section-item { margin-bottom: 10px; }
`
