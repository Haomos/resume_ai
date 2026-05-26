import { Link } from 'react-router-dom'
import type { AnalysisResult } from '../../api/types'

interface ResultActionBarProps {
  analysis: AnalysisResult
  reanalyzing: boolean
  generating: boolean
  onReanalyze: () => void
  onGenerate: () => void
}

export function ResultActionBar({
  analysis,
  reanalyzing,
  generating,
  onReanalyze,
  onGenerate,
}: ResultActionBarProps) {
  const fit = (analysis.dimension_scores_json ?? {}) as Record<string, unknown>
  const isVeto = fit.veto === true

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onReanalyze}
        disabled={reanalyzing}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {reanalyzing ? '重新分析中...' : '♻️ 重新分析'}
      </button>

      {isVeto ? (
        <span className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-900/20 dark:text-rose-300">
          🛑 不建议投递
        </span>
      ) : (
        <button
          type="button"
          onClick={onGenerate}
          disabled={generating}
          className="inline-flex items-center gap-2 rounded-lg bg-seeker-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-seeker-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {generating ? '生成中...' : '📄 立即生成并编辑'}
        </button>
      )}

      <Link
        to={`/seeker/pool?analysis_id=${analysis.id}`}
        className="inline-flex items-center gap-2 rounded-lg border border-seeker-200 bg-white px-4 py-2 text-sm font-medium text-seeker-700 shadow-sm transition-colors hover:bg-seeker-50 dark:border-seeker-900 dark:bg-slate-900 dark:text-seeker-300"
      >
        ✍️ 去档案页补充经历
      </Link>
      <Link
        to="/seeker/history"
        className="text-xs text-slate-500 hover:underline"
      >
        ← 返回历史记录
      </Link>
    </div>
  )
}
