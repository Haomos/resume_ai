import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api } from '../../api/client'
import type { ResumeResponse, JsonResume } from '../../api/types'
import { EmptyState } from '../../shared/EmptyState'
import { formatDateTime } from '../../utils/datetime'
import { renderJsonResume } from '../../templates'

export function SeekerResumes() {
  const [items, setItems] = useState<ResumeResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [exportingId, setExportingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除这个投递版本吗？此操作不可恢复。')) return
    setDeletingId(id)
    try {
      await api.resumes.delete(id)
      setItems((prev) => prev.filter((r) => r.id !== id))
      toast.success('已删除')
    } catch (err) {
      toast.error('删除失败: ' + (err instanceof Error ? err.message : 'unknown'))
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    api.resumes.list(50, 0, 'snapshot')
      .then((res) => {
        if (cancelled) return
        setItems(res)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        toast.error('加载失败: ' + (err instanceof Error ? err.message : 'unknown'))
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <section className="mx-auto max-w-4xl py-12 text-center text-slate-500">
        加载投递版本中…
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-seeker-600">求职者模式 · /seeker/resumes</p>
          <h1 className="text-2xl font-semibold tracking-tight">我的简历（投递版本）</h1>
        </div>
        <Link
          to="/seeker/pool"
          className="rounded-lg bg-seeker-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-seeker-700"
        >
          + 新建投递版本
        </Link>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon="📄"
          title="暂无投递版本"
          description="在「我的档案」中选择目标岗位，AI 会为你生成定制简历。"
          actions={[{ label: '去我的档案', to: '/seeker/pool', variant: 'primary' }]}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((r) => {
            const meta = (r.structured_json?.meta ?? {}) as Record<string, unknown>
            const strategy = meta.strategy as Record<string, unknown> | undefined
            const score = strategy?.overall_score as number | undefined
            // const forJobId = meta.for_job_id as number | undefined

            return (
              <div
                key={r.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                    {r.filename.replace(/^投递_/, '').replace(/\.pdf$/, '')}
                  </h3>
                  {score != null && (
                    <span className="rounded-full bg-seeker-100 px-2.5 py-0.5 text-xs font-medium text-seeker-700 dark:bg-seeker-900/30 dark:text-seeker-300">
                      匹配度 {Math.round(score * 100)}%
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  生成于 {formatDateTime(r.created_at)}
                </p>
                <div className="mt-4 flex gap-2">
                  <Link
                    to={`/seeker/resumes/${r.id}`}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    编辑
                  </Link>
                  <button
                    type="button"
                    disabled={exportingId === r.id}
                    onClick={async () => {
                      setExportingId(r.id)
                      try {
                        const html = renderJsonResume(r.structured_json as unknown as JsonResume, 'default')
                        const blob = await api.resumes.exportPdf(
                          r.id,
                          html,
                          (r.filename || 'resume').replace(/\.pdf$/, '') || 'resume'
                        )
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a')
                        a.href = url
                        a.download = r.filename || 'resume.pdf'
                        a.click()
                        URL.revokeObjectURL(url)
                        toast.success('PDF 导出成功')
                      } catch (err) {
                        toast.error('导出失败: ' + (err instanceof Error ? err.message : 'unknown'))
                      } finally {
                        setExportingId(null)
                      }
                    }}
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {exportingId === r.id ? '导出中…' : '导出 PDF'}
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === r.id}
                    onClick={() => handleDelete(r.id)}
                    className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
                  >
                    {deletingId === r.id ? '删除中…' : '🗑️ 删除'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
