interface ReportViewProps {
  report?: {
    assessment?: {
      verdict?: { action?: string }
      gate?: { pass?: boolean; reasons?: string[] }
    }
    matched_skills?: string[]
    missing_skills?: string[]
    action_items?: Array<{ priority: string; issue: string; rewritten?: string }>
    selected_count?: number
    omitted_count?: number
  }
}

export function ReportView({ report }: ReportViewProps) {
  return (
    <div className="space-y-5">
      {(() => {
        if (!report) return <p className="text-sm text-slate-500">暂无生成报告</p>
      const verdict = report.assessment?.verdict?.action ?? 'uncertain'
      const verdictMap: Record<string, { cls: string; label: string }> = {
        apply: { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', label: '✅ 建议投递' },
        gap_fill_first: { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', label: '⚠️ 先补缺口' },
        mismatch: { cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300', label: '❌ 不建议投递' },
      }
      const v = verdictMap[verdict] || { cls: 'bg-slate-100 text-slate-600', label: verdict }
      return (
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">投递建议</h3>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${v.cls}`}>{v.label}</span>
          </div>
          {report.assessment?.gate?.pass === false && (
            <div className="mb-3 space-y-1">
              <p className="text-xs font-medium text-rose-700 dark:text-rose-300">未通过门槛：</p>
              <ul className="list-disc pl-4 text-xs text-rose-600 dark:text-rose-400">
                {report.assessment.gate.reasons?.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500">匹配技能</span>
              <p className="font-medium text-emerald-600">{(report.matched_skills ?? []).length} 项</p>
            </div>
            <div>
              <span className="text-slate-500">缺失技能</span>
              <p className="font-medium text-rose-600">{(report.missing_skills ?? []).length} 项</p>
            </div>
            <div>
              <span className="text-slate-500">选取经历</span>
              <p className="font-medium text-seeker-600">{report.selected_count ?? 0} 条</p>
            </div>
            <div>
              <span className="text-slate-500">省略经历</span>
              <p className="font-medium text-slate-600">{report.omitted_count ?? 0} 条</p>
            </div>
          </div>
        </div>
      )
    })()}

    {(() => {
      const matched = report?.matched_skills ?? []
      if (matched.length === 0) return null
      return (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4 dark:border-emerald-900/30 dark:bg-emerald-950/20">
          <h3 className="mb-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">✅ 匹配技能</h3>
          <div className="flex flex-wrap gap-2">
            {matched.map((s: string) => (
              <span key={s} className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200">{s}</span>
            ))}
          </div>
        </div>
      )
    })()}

    {(() => {
      const missing = report?.missing_skills ?? []
      if (missing.length === 0) return null
      return (
        <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-4 dark:border-rose-900/30 dark:bg-rose-950/20">
          <h3 className="mb-2 text-sm font-semibold text-rose-800 dark:text-rose-300">❌ 缺失技能 / 要求</h3>
          <div className="flex flex-wrap gap-2">
            {missing.map((s: string) => (
              <span key={s} className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs text-rose-700 dark:bg-rose-900/50 dark:text-rose-200">{s}</span>
            ))}
          </div>
        </div>
      )
    })()}

    {(() => {
      const items = report?.action_items ?? []
      if (items.length === 0) return null
      return (
        <div className="space-y-3 rounded-xl border border-amber-100 bg-amber-50/40 p-4 dark:border-amber-900/30 dark:bg-amber-950/20">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">💡 改进建议</h3>
          {items.map((item, i) => (
            <div key={i} className="rounded bg-white/60 p-2.5 dark:bg-black/20">
              <div className="flex items-center gap-1.5">
                <span className={[
                  'rounded px-1 text-[10px] font-medium',
                  item.priority === 'high' ? 'bg-rose-100 text-rose-700' : item.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600',
                ].join(' ')}>
                  {item.priority === 'high' ? '高' : item.priority === 'medium' ? '中' : '低'}
                </span>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{item.issue}</span>
              </div>
              {item.rewritten && <p className="mt-1 text-xs text-slate-500">{item.rewritten}</p>}
            </div>
          ))}
        </div>
      )
    })()}
  </div>
  )
}
