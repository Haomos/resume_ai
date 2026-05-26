import type { JsonResume } from '../../api/types'
import { renderResumeBody, wrapDocument } from '../shared/utils'

export function render(resume: JsonResume, lineHeight = '1.7'): string {
  return wrapDocument(renderResumeBody(resume), resume.basics.name, THEME_CSS, lineHeight)
}

const THEME_CSS = `
/* ─── Dark Tech Theme ─── */
body {
  background: #0a0e1a;
  color: #cbd5e1;
  font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas",
               "Source Code Pro", "PingFang SC", "Microsoft YaHei", monospace;
}

.resume-page {
  background: #111827;
  border-top: 4px solid #06b6d4;
  box-shadow: 0 8px 40px rgba(0,0,0,0.5);
}

/* Header */
.resume-content .resume-header .header-text h1 {
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  color: #22d3ee;
  letter-spacing: 0.05em;
  margin: 0 0 8px 0;
}
.resume-content .resume-header .header-text h1::before {
  content: "> ";
  color: #06b6d4;
  font-weight: 400;
}
.resume-content .resume-header .header-text .contact-line {
  text-align: center;
  color: #94a3b8;
  font-size: 12.5px;
  margin: 0 0 10px 0;
}
.resume-content .resume-header .header-text .contact-line a {
  color: #22d3ee;
  text-decoration: none;
}
.resume-content .resume-header .header-text .summary {
  text-align: center;
  color: #94a3b8;
  font-size: 13px;
  margin: 0 0 14px 0;
}

/* Sections */
h2 {
  font-size: 14px;
  font-weight: 700;
  margin: 24px 0 10px 0;
  padding: 5px 10px 5px 14px;
  color: #22d3ee;
  background: rgba(6, 182, 212, 0.08);
  border-left: 4px solid #06b6d4;
  letter-spacing: 0.03em;
}
h2::before {
  content: "// ";
  color: #475569;
  font-weight: 400;
}

h3 {
  font-size: 13.5px;
  font-weight: 600;
  margin: 12px 0 5px 0;
  color: #e2e8f0;
}
h3 span {
  color: #64748b !important;
}
h3::before {
  content: "▎";
  color: #06b6d4;
  margin-right: 4px;
}

/* Paragraphs & lists */
.resume-content p {
  color: #cbd5e1;
  margin: 0 0 6px 0;
}
.resume-content ul, .resume-content ol {
  color: #cbd5e1;
  margin: 0 0 8px 0;
  padding-left: 18px;
}
.resume-content li {
  margin-bottom: 3px;
}

/* Inline code */
.resume-content code {
  background: rgba(6, 182, 212, 0.12);
  color: #67e8f9;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 0.9em;
}

/* Links */
.resume-content a {
  color: #22d3ee;
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* Skills / keywords */
.section-item p span {
  color: #94a3b8 !important;
}
.section-item p strong {
  color: #e2e8f0;
}

/* Photo */
.resume-content .resume-photo-wrap .resume-photo {
  border: 2px solid rgba(6, 182, 212, 0.3);
  border-radius: 6px;
}

/* Print overrides — force light background for printers */
@media print {
  body { background: #fff !important; color: #1f2937 !important; }
  .resume-page { background: #fff !important; border-top-color: #0ea5e9 !important; box-shadow: none !important; }
  .resume-content .resume-header .header-text h1 { color: #0c4a6e !important; }
  .resume-content .resume-header .header-text .contact-line,
  .resume-content .resume-header .header-text .summary { color: #4b5563 !important; }
  h2 { color: #0c4a6e !important; background: #f0f9ff !important; border-left-color: #0ea5e9 !important; }
  h3 { color: #1e293b !important; }
  h3 span { color: #6b7280 !important; }
  .resume-content p,
  .resume-content ul,
  .resume-content ol { color: #374151 !important; }
  .resume-content code { background: #f1f5f9 !important; color: #0369a1 !important; }
  .resume-content a { color: #0284c7 !important; }
  .section-item p strong { color: #111827 !important; }
}
`
