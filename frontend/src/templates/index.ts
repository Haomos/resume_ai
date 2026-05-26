import type { JsonResume } from '../api/types'
import type { ThemeName, ThemeMeta, RenderFn } from './shared/types'

import { render as renderDefault } from './default'
import { render as renderModern } from './modern'
import { render as renderMinimal } from './minimal'
import { render as renderClassic } from './classic'
import { render as renderTech } from './tech'
import { render as renderTechDark } from './tech-dark'
import { render as renderElegant } from './elegant'

export type { ThemeName, ThemeMeta, RenderFn }

export const THEME_LIST: ThemeMeta[] = [
  { name: 'default', label: '默认专业' },
  { name: 'modern', label: '现代色块' },
  { name: 'minimal', label: '极简留白' },
  { name: 'classic', label: '中式正统' },
  { name: 'tech', label: '程序员极客' },
  { name: 'elegant', label: '优雅商务' },
  { name: 'tech-dark', label: '科技暗黑' },
]

export const THEME_MAP: Record<ThemeName, RenderFn> = {
  default: renderDefault,
  modern: renderModern,
  minimal: renderMinimal,
  classic: renderClassic,
  tech: renderTech,
  elegant: renderElegant,
  'tech-dark': renderTechDark,
}

export function renderJsonResume(resume: JsonResume, theme: ThemeName, lineHeight?: string): string {
  try {
    const fn = THEME_MAP[theme] || renderDefault
    return fn(resume, lineHeight)
  } catch (err) {
    console.error('[renderJsonResume] failed:', err, 'resume keys:', Object.keys(resume || {}))
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>预览错误</title></head><body style="padding:40px;font-family:sans-serif;"><h1>⚠️ 简历预览渲染失败</h1><p style="color:#666">错误信息：${String(err)}</p><p style="color:#999;font-size:12px">请检查简历数据是否完整，或刷新页面重试。</p></body></html>`
  }
}
