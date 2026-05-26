import type { JsonResume } from '../../../api/types'

interface DiffViewProps {
  masterData: JsonResume
  snapshotData: JsonResume
}

export function DiffView({ masterData, snapshotData }: DiffViewProps) {
  return (
  /* Diff view */
  <div className="space-y-6">
    {(['work', 'projects'] as const).map((section) => {
      const masterList = (masterData[section] ?? []) as Array<{ id?: string; summary?: string; highlights?: string[]; description?: string }>
      const snapList = (snapshotData[section] ?? []) as Array<{ id?: string; summary?: string; highlights?: string[]; description?: string; meta?: { source_entry_id?: string } }>

      return snapList.map((snapItem, idx) => {
        const sourceId = snapItem.meta?.source_entry_id
        const origItem = masterList.find((e) => e.id === sourceId)
        if (!origItem) return null

        const origText = origItem.summary || origItem.description || ''
        const genText = snapItem.summary || snapItem.description || ''
        if (origText === genText) return null

        return (
          <div key={`${section}-${idx}`} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              {section === 'work' ? '💼 工作经历' : '📁 项目经历'} · 改写对比
            </h4>
            <div className="space-y-3 text-sm leading-relaxed">
              <div className="rounded-lg bg-rose-50 p-3 text-rose-800 dark:bg-rose-900/20 dark:text-rose-200">
                <div className="mb-1 text-xs font-medium text-rose-500">原始措辞</div>
                <p className="line-through opacity-70">{origText}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-3 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
                <div className="mb-1 text-xs font-medium text-emerald-600">AI 改写后</div>
                <p className="whitespace-pre-wrap">{genText}</p>
              </div>
            </div>
          </div>
        )
      })
    })}

    {/* Skills reorder */}
    {(() => {
      const origSkills = (masterData.skills ?? []).map((s: { name?: string }) => s.name).join(', ')
      const genSkills = (snapshotData.skills ?? []).map((s: { name?: string }) => s.name).join(', ')
      if (origSkills !== genSkills) {
        return (
          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <h4 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">🛠️ 技能列表调整</h4>
            <div className="text-sm text-slate-500 line-through dark:text-slate-400">{origSkills}</div>
            <div className="mt-1 text-sm font-medium text-seeker-600">{genSkills}</div>
          </div>
        )
      }
      return null
    })()}
  </div>
  )
}
