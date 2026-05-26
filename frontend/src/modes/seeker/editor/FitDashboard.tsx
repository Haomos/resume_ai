export interface FitData {
  weighted_score: number
  skills_fit: number
  experience_depth: number
  domain_fit: number
  entry_relevance: number
  hard_constraints: number
  details?: Record<string, string>
}

export function FitDashboard({ fit }: { fit: FitData }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">多维契合度评估</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
          fit.weighted_score >= 0.7 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
          fit.weighted_score >= 0.55 ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' :
          fit.weighted_score >= 0.35 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
          'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
        }`}>
          综合 {Math.round(fit.weighted_score * 100)}%
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { label: '技能匹配', key: 'skills_fit', score: fit.skills_fit, icon: '🛠️' },
          { label: '经验深度', key: 'experience_depth', score: fit.experience_depth, icon: '📈' },
          { label: '领域契合', key: 'domain_fit', score: fit.domain_fit, icon: '🎯' },
          { label: '经历相关', key: 'entry_relevance', score: fit.entry_relevance, icon: '💼' },
          { label: '硬性条件', key: 'hard_constraints', score: fit.hard_constraints, icon: '📋' },
        ].map((dim) => (
          <div key={dim.label} className="rounded-lg bg-white p-2 dark:bg-slate-900/50">
            <div className="mb-1 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400">
              <span>{dim.icon}</span>
              <span>{dim.label}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-1.5 rounded-full ${
                  dim.score >= 0.6 ? 'bg-emerald-500' :
                  dim.score >= 0.35 ? 'bg-amber-500' :
                  'bg-rose-500'
                }`}
                style={{ width: `${Math.round(dim.score * 100)}%` }}
              />
            </div>
            <div className="mt-1 text-right text-[10px] font-medium text-slate-600 dark:text-slate-300">
              {Math.round(dim.score * 100)}%
            </div>
            {fit.details?.[dim.key] && (
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                {fit.details[dim.key]}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
