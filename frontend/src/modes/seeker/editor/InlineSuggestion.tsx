import { useState } from 'react'

export interface SuggestionItem {
  priority: string
  path?: string
  issue: string
  rewritten?: string
}

/** 把 path 转成人类可读的字段位置，防止用户分不清改的是哪个字段 */
function pathToLabel(path: string): string {
  const m = path.match(/^([a-zA-Z]+)(?:\[(\d+)\])?(?:\.(\w+))?(?:\[(\d+)\])?$/)
  if (!m) return path
  const [, section, idx, field, subIdx] = m
  const secMap: Record<string, string> = {
    basics: '基本信息',
    work: '工作经历',
    education: '教育经历',
    projects: '项目经历',
    skills: '技能',
    awards: '获奖',
  }
  const fieldMap: Record<string, string> = {
    summary: '个人简介',
    description: '项目描述',
    highlights: '亮点/成果',
    keywords: '关键词',
    score: '成绩/GPA',
    name: '名称',
    position: '职位',
    institution: '学校',
    studyType: '学位',
    area: '专业',
    level: '熟练度',
  }
  const parts: string[] = [secMap[section] || section]
  if (idx !== undefined) parts.push(`第${Number(idx) + 1}条`)
  if (field) parts.push(fieldMap[field] || field)
  if (subIdx !== undefined) parts.push(`[${subIdx}]`)
  return parts.join(' · ')
}

export function InlineSuggestion({
  suggestion,
  onApply,
  onRevert,
}: {
  suggestion: SuggestionItem
  onApply: () => void
  onRevert?: () => void
}) {
  const [ignored, setIgnored] = useState(false)
  const [applied, setApplied] = useState(false)
  if (ignored) return null

  const rewritten = suggestion.rewritten ?? ''
  const targetLabel = suggestion.path ? pathToLabel(suggestion.path) : ''

  const handleApply = () => {
    setApplied(true)
    onApply()
  }

  const handleRevert = () => {
    setApplied(false)
    onRevert?.()
  }

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/30 dark:bg-amber-950/20">
      <div className="flex items-center gap-1.5">
        <span
          className={[
            'rounded px-1 text-[10px] font-medium',
            suggestion.priority === 'high'
              ? 'bg-rose-100 text-rose-700'
              : suggestion.priority === 'medium'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-100 text-slate-600',
          ].join(' ')}
        >
          {suggestion.priority === 'high' ? '高' : suggestion.priority === 'medium' ? '中' : '低'}
        </span>
        <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">💡 {suggestion.issue}</p>
      </div>
      {targetLabel && (
        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">📍 目标字段：{targetLabel}</p>
      )}
      <div className="mt-1.5 rounded border border-emerald-200 bg-white/80 p-2 dark:border-emerald-900/30 dark:bg-slate-900/40">
        <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">改写版：</p>
        <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-slate-700 dark:text-slate-300">{rewritten}</p>
      </div>
      <div className="mt-2 flex gap-2">
        {!applied ? (
          <button
            type="button"
            onClick={handleApply}
            className="rounded bg-seeker-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-seeker-700"
          >
            ✅ 一键替换
          </button>
        ) : (
          <button
            type="button"
            onClick={handleRevert}
            disabled={!onRevert}
            className="rounded border border-seeker-600 bg-seeker-50 px-2 py-1 text-[11px] font-medium text-seeker-700 hover:bg-seeker-100 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-seeker-950/20 dark:text-seeker-300 dark:hover:bg-seeker-900/30"
          >
            ↩️ 撤销
          </button>
        )}
        {!applied && (
          <button
            type="button"
            onClick={() => setIgnored(true)}
            className="rounded border border-slate-300 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            ❌ 忽略
          </button>
        )}
      </div>
    </div>
  )
}
