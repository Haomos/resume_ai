import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../api/client'
import type { JobResponse } from '../../api/types'
import { formatDateTime } from '../../utils/datetime'
import { EmptyState } from '../../shared/EmptyState'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

interface BatchRow {
  batch_id: string
  job_id: number
  status: string
  total: number
  completed: number
  failed_count?: number
  success_count: number
  created_at: string
  job?: JobResponse
}

/** 状态徽标颜色映射（含 BE counter 撒谎识破：success_count < total 视为 partial） */
function statusBadge(b: BatchRow): { label: string; color: string } {
  if (b.status === 'failed') {
    return { label: '❌ 失败', color: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300' }
  }
  if (b.status === 'completed') {
    if ((b.failed_count ?? 0) > 0) {
      return {
        label: `⚠ 部分失败（${b.failed_count} 失败 / ${b.success_count} 成功）`,
        color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
      }
    }
    return { label: `✓ 完成（${b.total}）`, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' }
  }
  if (b.status === 'running') {
    return {
      label: `⏳ 进行中（${b.completed}/${b.total}）`,
      color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
    }
  }
  return { label: b.status, color: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' }
}

/**
 * RecruiterBatchList — /recruiter/leaderboard (无 batchId 时)
 *
 * Bug 3 修复 — 之前 sidebar 的「排行榜」menu 直接跳 /recruiter/leaderboard 但该路由
 * 要求 :batchId，点了没反应。现在这里显示历史批次列表，点行进具体排行榜。
 */
export function RecruiterBatchList() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [rows, setRows] = useState<BatchRow[]>([])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const [batches, jobs] = await Promise.all([
          api.analysis.batch.list(50, 0),
          api.jobs.list(200, 0),
        ])
        if (cancelled) return
        const jobMap = new Map(jobs.map((j) => [j.id, j]))
        setRows(batches.map((b) => ({ ...b, job: jobMap.get(b.job_id) })))
        setState({ status: 'ready' })
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof ApiError ? `HTTP ${err.status}` : err instanceof Error ? err.message : 'error'
        setState({ status: 'error', message: msg })
      }
    }
    void run()
    return () => { cancelled = true }
  }, [])

  if (state.status === 'loading') {
    return <section className="mx-auto max-w-5xl py-12 text-center text-slate-500">加载批次历史…</section>
  }
  if (state.status === 'error') {
    return <section className="mx-auto max-w-5xl py-12 text-center text-red-600">❌ {state.message}</section>
  }

  return (
    <section className="mx-auto max-w-5xl space-y-4">
      <header className="space-y-1">
        <p className="text-sm font-medium text-recruiter-600">招聘者模式 · /recruiter/leaderboard</p>
        <h1 className="text-2xl font-semibold tracking-tight">排行榜历史</h1>
        <p className="text-sm text-slate-500">所有批量评分的历史记录，按时间倒序。点行进入具体批次的排行榜。</p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon="📊"
          title="暂无批次记录"
          description="在「批量评分」页发起一次评分后，结果会汇总到这里。"
          actions={[{ label: '去批量评分', to: '/recruiter/score', variant: 'primary' }]}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
              <tr>
                <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">时间</th>
                <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">岗位</th>
                <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">状态</th>
                <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">进度</th>
                <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">Batch ID</th>
                <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((b) => {
                const badge = statusBadge(b)
                return (
                  <tr key={b.batch_id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                    <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">{formatDateTime(b.created_at)}</td>
                    <td className="px-4 py-3">
                      {b.job ? (
                        <span>
                          <span className="font-medium">{b.job.position ?? '(未命名)'}</span>
                          {b.job.company && <span className="text-slate-400"> @ {b.job.company}</span>}
                        </span>
                      ) : (
                        <span className="text-slate-400">岗位 #{b.job_id}（已删除）</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${badge.color}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-300">
                      {b.completed}/{b.total} · 失败 {b.failed_count ?? 0}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {b.batch_id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/recruiter/leaderboard/${b.batch_id}`}
                        className="text-xs text-recruiter-600 hover:underline"
                      >
                        查看排行榜 →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
