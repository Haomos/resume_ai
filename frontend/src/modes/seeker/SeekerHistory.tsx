import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../api/client'
import type { AnalysisResult, JobResponse } from '../../api/types'
import { formatDateTime } from '../../utils/datetime'
import { EmptyState } from '../../shared/EmptyState'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

interface EnrichedAnalysis extends AnalysisResult {
  job?: JobResponse | null
}

/**
 * SeekerHistory — /seeker/history
 * Phase 7c: 恢复为分析记录页面。
 *  - 列出 POST /seeker/analyze 保存的分析记录（档案 vs JD）
 *  - 显示岗位、分析时间、匹配度、投递建议
 *  - 点击跳转 /seeker/result/{id}
 */
export function SeekerHistory() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [items, setItems] = useState<EnrichedAnalysis[]>([])

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这条分析记录？')) return
    try {
      await api.analysis.delete(id)
      setItems((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      toast.error('删除失败: ' + (err instanceof Error ? err.message : 'unknown'))
    }
  }

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const [analyses, jobs] = await Promise.all([
          api.analysis.list(50, 0),
          api.jobs.list(50, 0),
        ])
        if (cancelled) return
        const jobMap = new Map(jobs.map((j) => [j.id, j]))
        const enriched: EnrichedAnalysis[] = analyses.map((a) => ({
          ...a,
          job: jobMap.get(a.job_id) ?? null,
        }))
        setItems(enriched)
        setState({ status: 'ready' })
      } catch (err) {
        if (cancelled) return
        const msg =
          err instanceof ApiError
            ? `HTTP ${err.status} 加载失败`
            : err instanceof Error
              ? err.message
              : 'unknown error'
        setState({ status: 'error', message: msg })
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading') {
    return (
      <section className="mx-auto max-w-4xl py-12 text-center text-slate-500">
        加载历史记录...
      </section>
    )
  }
  if (state.status === 'error') {
    return (
      <section className="mx-auto max-w-4xl py-12 text-center text-red-600">
        ❌ {state.message}
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-seeker-600">求职者模式 · /seeker/history</p>
          <h1 className="text-2xl font-semibold tracking-tight">历史记录</h1>
        </div>
        <Link
          to="/seeker/analyze"
          className="rounded-lg bg-seeker-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-seeker-700"
        >
          + 新建分析
        </Link>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon="🕒"
          title="暂无分析记录"
          description="在「开始分析」中评估档案与岗位契合度后，结果会出现在这里。"
          actions={[{ label: '开始第一次分析', to: '/seeker/analyze', variant: 'primary' }]}
        />
      ) : (
        <div className="space-y-3">
          {items.map((a) => {
            const meta = (a.model_config_json ?? {}) as Record<string, unknown>
            const report = meta.report as Record<string, unknown> | undefined
            const fit = report?.fit as Record<string, unknown> | undefined
            const score = typeof fit?.weighted_score === 'number' ? Math.round(fit.weighted_score * 100) : null
            const assessment = meta.assessment as Record<string, unknown> | undefined
            const verdict = assessment?.verdict as Record<string, unknown> | undefined
            const action = String(verdict?.action ?? '')

            const actionStyles: Record<string, string> = {
              apply: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
              gap_fill_first: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
              mismatch: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
            }
            const actionText: Record<string, string> = {
              apply: '建议投递',
              gap_fill_first: '先补缺口',
              mismatch: '不建议',
            }

            return (
              <div
                key={a.id}
                className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <Link
                  to={`/seeker/result/${a.id}`}
                  className="flex min-w-0 flex-1 items-center gap-4"
                >
                  <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full text-[10px] font-medium ${actionStyles[action] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                    <span>{score ?? '—'}%</span>
                    <span>{actionText[action] ?? '待定'}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                        分析 #{a.id} · {a.job?.position ?? `JD #${a.job_id}`}
                        {a.job?.company ? ` @ ${a.job.company}` : ''}
                      </p>
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">基于档案</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {formatDateTime(a.created_at)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      匹配 {(report?.matched_skills as string[] ?? []).length} 项 · 缺失 {(report?.missing_skills as string[] ?? []).length} 项
                    </p>
                  </div>
                  <span className="text-xs text-slate-400">查看 →</span>
                </Link>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    void handleDelete(a.id)
                  }}
                  className="rounded-md px-2 py-1 text-xs text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/30 dark:hover:text-rose-300"
                  title="删除"
                >
                  🗑️
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
