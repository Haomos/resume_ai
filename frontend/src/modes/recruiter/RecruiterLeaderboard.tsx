import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../api/client'
import type { AnalysisResult, JobResponse, ResumeResponse } from '../../api/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

interface Row {
  analysis: AnalysisResult
  resume: ResumeResponse | null
}

function scoreColor(n: number): string {
  if (n >= 80) return 'text-emerald-600 dark:text-emerald-400'
  if (n >= 60) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

/**
 * RecruiterLeaderboard — /recruiter/leaderboard/:batchId
 *  - 展示批量评分结果：表格形式，默认按 total_score 降序
 *  - 支持 CSV 导出
 *  - 点击行下钻到 /seeker/result/:analysisId（复用求职者结果页）
 */
export function RecruiterLeaderboard() {
  const { batchId } = useParams<{ batchId: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [rows, setRows] = useState<Row[]>([])
  const [job, setJob] = useState<JobResponse | null>(null)
  const [meta, setMeta] = useState<{ status: string; total: number; completed: number; avg_score: number } | null>(null)

  useEffect(() => {
    if (!batchId) return
    let cancelled = false
    const run = async () => {
      try {
        const batch = await api.analysis.batch.get(batchId)
        if (cancelled) return
        setMeta({
          status: batch.status,
          total: batch.total,
          completed: batch.completed,
          avg_score: batch.avg_score,
        })

        // 拉取简历详情用于显示文件名
        const resumeIds = [...new Set(batch.results.map((r) => r.resume_id))]
        const resumes: ResumeResponse[] = []
        for (const rid of resumeIds) {
          try {
            const r = await api.resumes.get(rid)
            resumes.push(r)
          } catch { /* ignore missing resume */ }
        }
        const resumeMap = new Map(resumes.map((r) => [r.id, r]))

        // 拉取 JD
        let j: JobResponse | null = null
        if (batch.results.length > 0) {
          try {
            j = await api.jobs.get(batch.results[0].job_id)
          } catch { /* ignore */ }
        }
        setJob(j)

        const enriched: Row[] = batch.results.map((a) => ({
          analysis: a,
          resume: resumeMap.get(a.resume_id) ?? null,
        }))
        setRows(enriched)
        setState({ status: 'ready' })
      } catch (err) {
        if (cancelled) return
        const msg = err instanceof ApiError ? `HTTP ${err.status}` : err instanceof Error ? err.message : 'error'
        setState({ status: 'error', message: msg })
      }
    }
    void run()
    return () => { cancelled = true }
  }, [batchId])

  const exportCSV = async () => {
    if (!batchId) return
    try {
      const csv = await api.analysis.batch.exportCSV(batchId)
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `batch_${batchId}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error('导出失败: ' + (err instanceof Error ? err.message : 'unknown'))
    }
  }

  const handleDelete = async (analysisId: number) => {
    if (!confirm('确定删除这条分析记录？')) return
    try {
      await api.analysis.delete(analysisId)
      setRows((prev) => prev.filter((r) => r.analysis.id !== analysisId))
    } catch (err) {
      toast.error('删除失败: ' + (err instanceof Error ? err.message : 'unknown'))
    }
  }

  const handleDeleteBatch = async () => {
    if (!batchId) return
    if (!confirm('确定删除整个排行榜？此操作会一并删除该批次下的所有分析记录，不可恢复。')) return
    try {
      await api.analysis.batch.delete(batchId)
      navigate('/recruiter/leaderboard')
    } catch (err) {
      toast.error('删除排行榜失败: ' + (err instanceof Error ? err.message : 'unknown'))
    }
  }

  if (!batchId) {
    return (
      <section className="mx-auto max-w-4xl py-12 text-center text-slate-500">缺少批次 ID。</section>
    )
  }
  if (state.status === 'loading') {
    return <section className="mx-auto max-w-4xl py-12 text-center text-slate-500">加载排行榜...</section>
  }
  if (state.status === 'error') {
    return <section className="mx-auto max-w-4xl py-12 text-center text-red-600">❌ {state.message}</section>
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-recruiter-600">招聘者模式 · /recruiter/leaderboard/{batchId}</p>
        <h1 className="text-2xl font-semibold tracking-tight">排行榜</h1>
        <p className="text-xs text-slate-500">
          岗位: {job?.position ?? '—'} {job?.company ? `@ ${job.company}` : ''} ·{' '}
          状态: {meta?.status} · {meta?.completed}/{meta?.total} · 均分: {meta?.avg_score ?? '—'}
        </p>
      </header>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={exportCSV}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800"
        >
          ⬇️ 导出 CSV
        </button>
        <button
          type="button"
          onClick={() => void handleDeleteBatch()}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 shadow-sm transition-colors hover:bg-rose-100 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300 dark:hover:bg-rose-900/30"
        >
          🗑️ 删除本排行榜
        </button>
        <Link to="/recruiter/score" className="text-xs text-slate-500 hover:underline">← 返回批量评分</Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">排名</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">简历</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">门槛</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">核心匹配</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">行动</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">总分</th>
              <th className="px-4 py-3 font-medium text-slate-700 dark:text-slate-300">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((row, idx) => {
              const score = Math.round(row.analysis.total_score)
              const meta = (row.analysis.model_config_json ?? {}) as Record<string, unknown>
              const assessment = meta.assessment as Record<string, unknown> | undefined
              const gate = assessment?.gate as Record<string, string> | undefined
              const core = assessment?.core as Record<string, unknown> | undefined
              const verdict = assessment?.verdict as Record<string, unknown> | undefined
              const action = String(verdict?.action ?? '')
              const dims = (row.analysis.dimension_scores_json ?? {}) as Record<string, number>
              const hasNew = !!assessment

              const gateAllPass = gate
                ? Object.values(gate).every((v) => v === 'pass')
                : false
              const gateAnyFail = gate
                ? Object.values(gate).some((v) => v === 'fail')
                : false

              const actionStyles: Record<string, string> = {
                interview: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                shortlist: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
                reject: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
                uncertain: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
              }
              const actionText: Record<string, string> = {
                interview: '约面',
                shortlist: '备胎',
                reject: '淘汰',
                uncertain: '待定',
              }

              return (
                <tr key={row.analysis.id} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                  <td className="px-4 py-3">#{idx + 1}</td>
                  <td className="px-4 py-3">
                    {row.resume?.filename ?? `简历 #${row.analysis.resume_id}`}
                  </td>
                  <td className="px-4 py-3">
                    {hasNew ? (
                      <span className="text-xs">
                        {gateAllPass && <span className="text-emerald-600 dark:text-emerald-400">✅ 全过</span>}
                        {gateAnyFail && <span className="text-rose-600 dark:text-rose-400">❌ 有未通过</span>}
                        {!gateAllPass && !gateAnyFail && <span className="text-amber-600 dark:text-amber-400">⚠️ 部分未知</span>}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">旧数据</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {hasNew ? (
                      <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                        {String(core?.overall_fit ?? '—')}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">技能 {dims.skill_match ?? 0} · 经验 {dims.experience_match ?? 0}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {action ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${actionStyles[action] ?? actionStyles.uncertain}`}>
                        {actionText[action] ?? action}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className={"px-4 py-3 font-bold " + scoreColor(score)}>{score}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/seeker/result/${row.analysis.id}`}
                        className="text-xs text-recruiter-600 hover:underline"
                      >
                        详情 →
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleDelete(row.analysis.id)}
                        className="text-xs text-slate-400 hover:text-rose-600"
                        title="删除"
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
