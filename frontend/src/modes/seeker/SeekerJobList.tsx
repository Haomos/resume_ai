import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../api/client'
import type { JobResponse } from '../../api/types'
import { formatDateTime } from '../../utils/datetime'

export function SeekerJobList() {
  const [jobs, setJobs] = useState<JobResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const loadJobs = () => {
    setLoading(true)
    api.jobs
      .list(50, 0)
      .then((r) => {
        setJobs(r)
        setLoading(false)
      })
      .catch((err) => {
        setError('加载失败')
        setLoading(false)
        console.warn('[SeekerJobList] load failed:', err)
      })
  }

  useEffect(() => {
    // React 19: 将数据加载标记为 transition，避免级联渲染
    const id = window.requestAnimationFrame(() => loadJobs())
    return () => window.cancelAnimationFrame(id)
  }, [])

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除这个岗位吗？')) return
    setDeletingId(id)
    try {
      await api.jobs.delete(id)
      setJobs((prev) => prev.filter((j) => j.id !== id))
    } catch (err) {
      const msg = err instanceof ApiError ? `HTTP ${err.status}` : 'error'
      toast.error('删除失败：' + msg)
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return <p className="py-12 text-center text-slate-500">加载岗位列表...</p>
  }
  if (error) {
    return <p className="py-12 text-center text-red-600">{error}</p>
  }
  if (jobs.length === 0) {
    return (
      <section className="mx-auto max-w-3xl py-16 text-center">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-4xl">🗂️</p>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">岗位管理</h1>
          <p className="text-sm text-slate-500">暂无已保存的岗位。</p>
          <Link
            to="/seeker/jobs"
            className="inline-flex items-center gap-2 rounded-lg bg-seeker-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-seeker-700"
          >
            录入新岗位
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-end justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-seeker-600">求职者模式 · /seeker/jobs/manage</p>
          <h1 className="text-2xl font-semibold tracking-tight">岗位管理</h1>
          <p className="text-sm text-slate-500">管理已保存的目标岗位，支持编辑与删除。</p>
        </div>
        <Link
          to="/seeker/jobs"
          className="inline-flex items-center gap-2 rounded-lg bg-seeker-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-seeker-700"
        >
          ➕ 录入新岗位
        </Link>
      </header>
      <ul className="space-y-3">
        {jobs.map((job) => (
          <li
            key={job.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800 dark:text-slate-100">
                #{job.id} · {job.position ?? '(未命名职位)'} {job.company ? `@ ${job.company}` : ''}
              </span>
              <span className="text-xs text-slate-400">
                {formatDateTime(job.created_at)}
              </span>
            </div>
            {job.location && <p className="text-xs text-slate-500">📍 {job.location}</p>}
            {(job.salary_min || job.salary_max) && (
              <p className="text-xs text-slate-500">
                💰 {job.salary_min ?? '?'}k - {job.salary_max ?? '?'}k
              </p>
            )}
            <div className="mt-3 flex items-center gap-3">
              <Link
                to={`/seeker/jobs?id=${job.id}`}
                className="text-xs font-medium text-seeker-600 hover:underline"
              >
                ✏️ 编辑
              </Link>
              <Link
                to={`/seeker/pool`}
                className="text-xs text-seeker-600 hover:underline"
              >
                → 用此 JD 生成投递版本
              </Link>
              <button
                type="button"
                onClick={() => handleDelete(job.id)}
                disabled={deletingId === job.id}
                className="ml-auto text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
              >
                {deletingId === job.id ? '删除中…' : '🗑️ 删除'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
