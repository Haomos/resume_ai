import type { FitData } from './FitDashboard'
import { FitDashboard } from './FitDashboard'

interface PreviewContentProps {
  fit?: FitData
  veto: boolean
  vetoReasons: string[]
  enrichment: string[]
  strategy: {
    report?: { matched_skills?: string[]; missing_skills?: string[] }
    requirements?: Record<string, unknown>
    entry_scores?: Record<string, number>
    low_match_warning?: boolean
    strategy_notes?: string[]
    coverage?: { matched: string[]; gaps: string[] }
  }
  selectedEntries: unknown[]
  omittedEntries: unknown[]
  confirmedIds: string[]
  showVetoOverride: boolean
  onToggleId: (id: string) => void
  onCloseAfterVeto?: () => void
  onToggleVetoOverride: () => void
}

function previewEntryTitle(entry: Record<string, unknown>): string {
  return (entry.name as string) || (entry.institution as string) || '未命名'
}

function previewEntrySubtitle(entry: Record<string, unknown>): string {
  const pos = entry.position as string | undefined
  const dates = [entry.startDate, entry.endDate].filter(Boolean).join(' – ')
  if (pos && dates) return ` · `
  return pos || dates || ''
}

export function PreviewContent({
  fit, veto, vetoReasons, enrichment, strategy,
  selectedEntries, omittedEntries, confirmedIds,
  showVetoOverride, onToggleId, onCloseAfterVeto, onToggleVetoOverride,
}: PreviewContentProps) {
  const requirements = strategy.requirements ?? {}

  return (
    <>
{/* Fit Dimensions Dashboard */}
{fit && <FitDashboard fit={fit} />}

{/* Strategy panel — AI 决策说明 + 覆盖详情（Phase 7b 验收项） */}
{((strategy.strategy_notes?.length ?? 0) > 0 || (strategy.coverage?.matched?.length ?? 0) > 0 || (strategy.coverage?.gaps?.length ?? 0) > 0) && (
  <div className="rounded-xl border border-seeker-100 bg-seeker-50 p-4 dark:border-seeker-900 dark:bg-seeker-900/20">
    <h3 className="mb-2 text-sm font-semibold text-seeker-700 dark:text-seeker-300">🤖 AI 决策说明</h3>
    {(strategy.strategy_notes?.length ?? 0) > 0 && (
      <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300">
        {strategy.strategy_notes!.map((note, i) => (
          <li key={i}>{note}</li>
        ))}
      </ul>
    )}
    {((strategy.coverage?.matched?.length ?? 0) > 0 || (strategy.coverage?.gaps?.length ?? 0) > 0) && (
      <div className="mt-3 space-y-1.5">
        {(strategy.coverage?.matched?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-baseline gap-1.5 text-[11px]">
            <span className="font-medium text-emerald-700 dark:text-emerald-300">✅ 已覆盖：</span>
            {strategy.coverage!.matched.map((m) => (
              <span key={m} className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{m}</span>
            ))}
          </div>
        )}
        {(strategy.coverage?.gaps?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-baseline gap-1.5 text-[11px]">
            <span className="font-medium text-amber-700 dark:text-amber-300">⚠️ 缺口：</span>
            {strategy.coverage!.gaps.map((g) => (
              <span key={g} className="rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{g}</span>
            ))}
          </div>
        )}
      </div>
    )}
  </div>
)}

{/* Veto Block */}
{veto && (
  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-900/20">
    <div className="flex items-start gap-3">
      <span className="text-xl">🛑</span>
      <div className="flex-1">
        <h3 className="mb-1 text-sm font-bold text-rose-800 dark:text-rose-200">
          不建议为此岗位生成简历
        </h3>
        <ul className="mb-3 space-y-1 text-xs text-rose-700 dark:text-rose-300">
          {vetoReasons.map((reason, i) => (
            <li key={i}>• {reason}</li>
          ))}
        </ul>
        {enrichment.length > 0 && (
          <div className="mb-3 rounded-lg bg-white/60 p-2.5 dark:bg-slate-900/40">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">丰富档案建议</p>
            <ul className="space-y-1 text-xs text-slate-700 dark:text-slate-300">
              {enrichment.map((s, i) => (
                <li key={i}>→ {s}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {onCloseAfterVeto && (
            <button
              onClick={() => { onCloseAfterVeto() }}
              className="rounded-lg bg-seeker-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-seeker-700"
            >
              ✍️ 去丰富档案
            </button>
          )}
          <button
            onClick={() => onToggleVetoOverride()}
            className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-900 dark:bg-slate-800 dark:text-rose-300"
          >
            {showVetoOverride ? '收起' : '我仍要查看方案'}
          </button>
        </div>
      </div>
    </div>
  </div>
)}

{/* Dimension Breakdown */}
{(() => {
  const report = strategy.report
  const hasDetails = (report?.matched_skills?.length ?? 0) > 0 || (report?.missing_skills?.length ?? 0) > 0 || vetoReasons.length > 0 || enrichment.length > 0
  if (!hasDetails) return null
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-200">各维度评估依据</h3>
      <div className="space-y-3">
        {(report?.matched_skills?.length ?? 0) > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">✅ 已覆盖技能</p>
            <div className="flex flex-wrap gap-1.5">
              {report!.matched_skills!.map((s) => (
                <span key={s} className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{s}</span>
              ))}
            </div>
          </div>
        )}
        {(report?.missing_skills?.length ?? 0) > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-medium text-rose-600 dark:text-rose-400">❌ 技能缺口</p>
            <div className="flex flex-wrap gap-1.5">
              {report!.missing_skills!.map((s) => (
                <span key={s} className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{s}</span>
              ))}
            </div>
          </div>
        )}
        {vetoReasons.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-medium text-rose-600 dark:text-rose-400">🛑 硬性条件未满足</p>
            <ul className="space-y-1">
              {vetoReasons.map((r, i) => (
                <li key={i} className="text-xs text-rose-700 dark:text-rose-300">• {r}</li>
              ))}
            </ul>
          </div>
        )}
        {enrichment.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">💡 提升建议</p>
            <ul className="space-y-1">
              {enrichment.map((s, i) => (
                <li key={i} className="text-xs text-amber-700 dark:text-amber-300">→ {s}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
})()}

{/* JD Coverage */}
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
  {(requirements.must_have as string[] ?? []).length > 0 && (
    <div className="mt-2 text-xs text-slate-500">
      必须匹配：{(requirements.must_have as string[]).join('、')}
    </div>
  )}
  {!veto && strategy.low_match_warning && (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
      ⚠️ <b>匹配度一般</b>：当前档案与这份 JD 的关联度中等。
      生成后可以投递，但建议优先投递更匹配的岗位。
    </div>
  )}
</div>

{/* Entry selector — collapsible when vetoed */}
<div className={veto && !showVetoOverride ? 'opacity-50' : ''}>
  <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
    {veto && !showVetoOverride ? '选取经历（展开上方“我仍要查看方案”以编辑）' : '选取经历（可勾选调整）'}
  </h3>
  <div className="space-y-2">
    {selectedEntries.map((entry) => {
      const e = entry as Record<string, unknown>
      const id = String(e.id ?? '')
      if (!id) return null
      const checked = confirmedIds.includes(id)
      return (
        <label
          key={id}
          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
            checked
              ? 'border-seeker-200 bg-seeker-50 dark:border-seeker-800 dark:bg-seeker-900/20'
              : 'border-slate-200 bg-white opacity-60 dark:border-slate-700 dark:bg-slate-900'
          }`}
        >
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-seeker-600 focus:ring-seeker-500"
            checked={checked}
            onChange={() => onToggleId(id)}
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{previewEntryTitle(e)}</p>
            {previewEntrySubtitle(e) && (
              <p className="text-xs text-slate-500">{previewEntrySubtitle(e)}</p>
            )}
          </div>
          <span className="rounded bg-seeker-100 px-1.5 py-0.5 text-[10px] text-seeker-700 dark:bg-seeker-900/30 dark:text-seeker-300">
            匹配度 {Math.round((strategy.entry_scores?.[id] ?? 0) * 100)}%
          </span>
        </label>
      )
    })}
    {omittedEntries.map((entry) => {
      const e = entry as Record<string, unknown>
      const id = String(e.id ?? '')
      if (!id) return null
      const checked = confirmedIds.includes(id)
      return (
        <label
          key={id}
          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
            checked
              ? 'border-seeker-200 bg-seeker-50 dark:border-seeker-800 dark:bg-seeker-900/20'
              : 'border-slate-200 bg-white opacity-60 dark:border-slate-700 dark:bg-slate-900'
          }`}
        >
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-seeker-600 focus:ring-seeker-500"
            checked={checked}
            onChange={() => onToggleId(id)}
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{previewEntryTitle(e)}</p>
            {previewEntrySubtitle(e) && (
              <p className="text-xs text-slate-500">{previewEntrySubtitle(e)}</p>
            )}
          </div>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            匹配度 {Math.round((strategy.entry_scores?.[id] ?? 0) * 100)}%
          </span>
        </label>
      )
    })}
  </div>
</div>
    </>
  )
}
