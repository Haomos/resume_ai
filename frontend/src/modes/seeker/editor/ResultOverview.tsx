import type { JsonResume } from '../../../api/types'

interface ResultOverviewProps {
  strategy: {
    strategy_notes?: string[]
    requirements?: Record<string, unknown>
    coverage?: { matched: string[]; gaps: string[] }
    selected_entries?: string[]
    omitted_entries?: string[]
  }
  masterData: JsonResume
}

function findEntryById(data: JsonResume, id: string) {
  for (const section of ['work', 'projects', 'education'] as const) {
    const list = (data[section] ?? []) as Array<{ id?: string; name?: string; position?: string; institution?: string }>
    const found = list.find((e) => e.id === id)
    if (found) return { section, entry: found }
  }
  return null
}

export function ResultOverview({ strategy, masterData }: ResultOverviewProps) {
  const requirements = strategy.requirements ?? {}

  return (
    <>
    {/* Strategy notes */}
    {(strategy.strategy_notes ?? []).length > 0 && (
      <div className="rounded-xl border border-seeker-100 bg-seeker-50 p-4 dark:border-seeker-900 dark:bg-seeker-900/20">
        <h3 className="mb-2 text-sm font-semibold text-seeker-700 dark:text-seeker-300">🤖 AI 决策说明</h3>
        <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
          {(strategy.strategy_notes ?? []).map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      </div>
    )}

    {/* Requirements coverage */}
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
      <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">JD 要求覆盖</h3>
      <div className="flex flex-wrap gap-2">
        {(requirements.hard_skills as string[] ?? []).map((s) => (
          <span key={s} className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            ✅ {s}
          </span>
        ))}
        {(requirements.nice_to_have as string[] ?? []).map((s) => (
          <span key={s} className="rounded-full bg-sky-100 px-2.5 py-0.5 text-xs text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
            ⭐ {s}
          </span>
        ))}
      </div>
      {(strategy.coverage?.gaps ?? []).length > 0 && (
        <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          ⚠️ 未覆盖要求：{(strategy.coverage?.gaps ?? []).join('、')}
        </div>
      )}
    </div>

    {/* Selected entries */}
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">选取的经历</h3>
      <div className="space-y-2">
        {(strategy.selected_entries ?? []).map((id) => {
          const found = findEntryById(masterData, id)
          if (!found) return null
          const title = found.entry.name || found.entry.institution || '未命名'
          return (
            <div key={id} className="flex items-center gap-2 rounded-lg border border-seeker-100 bg-seeker-50 px-3 py-2 text-sm dark:border-seeker-900 dark:bg-seeker-900/20">
              <span className="text-seeker-600">✓</span>
              <span className="text-slate-700 dark:text-slate-200">{title}</span>
              <span className="ml-auto text-xs text-slate-400 capitalize">{found.section}</span>
            </div>
          )
        })}
      </div>
    </div>

    {/* Omitted entries */}
    {(strategy.omitted_entries ?? []).length > 0 && (
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-500 dark:text-slate-400">省略的经历</h3>
        <div className="space-y-2">
          {(strategy.omitted_entries ?? []).map((id) => {
            const found = findEntryById(masterData, id)
            if (!found) return null
            const title = found.entry.name || found.entry.institution || '未命名'
            return (
              <div key={id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-400 dark:border-slate-800 dark:bg-slate-800/30">
                <span>−</span>
                <span>{title}</span>
                <span className="ml-auto text-xs capitalize">{found.section}</span>
              </div>
            )
          })}
        </div>
      </div>
    )}
              ) : activeTab === 'diff' ? (
    </>
  )
}
