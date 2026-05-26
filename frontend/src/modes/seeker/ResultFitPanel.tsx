import type { FitData } from './editor/FitDashboard'
import { FitDashboard } from './editor/FitDashboard'

interface ResultFitPanelProps {
  dims: Record<string, unknown>
  meta: Record<string, unknown>
}

export function ResultFitPanel({ dims, meta }: ResultFitPanelProps) {
  const report = meta.report as Record<string, unknown> | undefined
  const assessment = report?.assessment as Record<string, unknown> | undefined
  const verdict = assessment?.verdict as Record<string, unknown> | undefined
  const action = String(verdict?.action ?? '')
  const gate = assessment?.gate as Record<string, unknown> | undefined
  const reasons = gate?.reasons as string[] | undefined
  const items = report?.action_items as Array<{ priority: string; issue: string; rewritten?: string }> | undefined

  const map: Record<string, { cls: string; label: string }> = {
    apply: { cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', label: '✅ 建议投递' },
    gap_fill_first: { cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', label: '⚠️ 先补缺口' },
    mismatch: { cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300', label: '❌ 不建议投递' },
  }
  const v = map[action]

  return (
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <FitDashboard fit={dims as unknown as FitData} />

      {v && (
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${v.cls}`}>{v.label}</span>
      )}

      {reasons && reasons.length > 0 && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900 dark:bg-rose-900/20">
          <p className="text-[10px] font-medium text-rose-700 dark:text-rose-300">🛑 未通过门槛</p>
          <ul className="mt-1 space-y-1">
            {reasons.map((r, i) => <li key={i} className="text-xs text-rose-700 dark:text-rose-300">• {r}</li>)}
          </ul>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-medium text-slate-500">💡 行动建议</p>
          {items.map((item, i) => (
            <div key={i} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
              <span className={`text-[10px] font-bold ${item.priority === 'high' ? 'text-rose-600' : 'text-amber-600'}`}>
                {item.priority === 'high' ? '高优' : '中优'}
              </span>
              <p className="text-xs text-slate-700 dark:text-slate-300">{item.issue}</p>
              {item.rewritten && <p className="text-[10px] text-emerald-600 dark:text-emerald-400">{item.rewritten}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
