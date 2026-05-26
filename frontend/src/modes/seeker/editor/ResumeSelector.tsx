import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { api, ApiError } from '../../../api/client'
import type { ResumeResponse } from '../../../api/types'
import { formatDateTime } from '../../../utils/datetime'

export function ResumeSelector({ onSelect, recordType = 'legacy' }: { onSelect?: (id: number) => void; recordType?: string }) {
  const [resumes, setResumes] = useState<ResumeResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)

  const loadResumes = () => {
    setLoading(true)
    api.resumes.list(50, 0, recordType)
      .then((r) => {
        setResumes(r)
        setLoading(false)
      })
      .catch((err) => {
        setError(err instanceof ApiError ? `HTTP ${err.status}` : err instanceof Error ? err.message : 'error')
        setLoading(false)
      })
  }

  useEffect(() => {
    const id = window.requestAnimationFrame(() => loadResumes())
    return () => window.cancelAnimationFrame(id)
  }, [])

  /** 新建空白简历 — 弹 prompt 取名（可空，后端会兜底"未命名简历"），创建后立即进入编辑器。 */
  const handleCreateBlank = async () => {
    if (creating) return
    const name = window.prompt('给新简历取个名字（可留空使用"未命名简历"）：', '')
    if (name === null) return // 用户取消
    setCreating(true)
    try {
      const trimmed = name.trim()
      const created = await api.resumes.createBlank(trimmed || undefined)
      // 不刷新列表 — 直接进入编辑器，编辑器加载该简历就是空白 <p></p>
      onSelect?.(created.id)
    } catch (err) {
      const msg = err instanceof ApiError ? `HTTP ${err.status}` : err instanceof Error ? err.message : 'error'
      toast.error('创建失败：' + msg)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('确定删除这份简历吗？此操作不可恢复。')) return
    setDeletingId(id)
    try {
      await api.resumes.delete(id)
      setResumes((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      const msg = err instanceof ApiError ? `HTTP ${err.status}` : err instanceof Error ? err.message : 'error'
      toast.error('删除失败：' + msg)
    } finally {
      setDeletingId(null)
    }
  }

  const startRename = (r: ResumeResponse) => {
    setEditingId(r.id)
    setEditName(r.filename)
  }

  const cancelRename = () => {
    setEditingId(null)
    setEditName('')
  }

  const submitRename = async (id: number) => {
    const name = editName.trim()
    if (!name) {
      toast('文件名不能为空')
      return
    }
    setSavingId(id)
    try {
      const updated = await api.resumes.update(id, { filename: name })
      setResumes((prev) => prev.map((r) => (r.id === id ? updated : r)))
      setEditingId(null)
    } catch (err) {
      const msg = err instanceof ApiError ? `HTTP ${err.status}` : err instanceof Error ? err.message : 'error'
      toast.error('重命名失败：' + msg)
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return <p className="py-12 text-center text-slate-500">加载简历列表...</p>
  }
  if (error) {
    return <p className="py-12 text-center text-red-600">加载失败：{error}</p>
  }
  if (resumes.length === 0) {
    return (
      <section className="mx-auto max-w-3xl py-16 text-center">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-4xl">📄</p>
          <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">我的简历</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            暂无已保存的简历。可以上传现有文件，或者从零开始新建一份。
          </p>
          <div className="flex items-center justify-center gap-3">
            <a
              href="/seeker/upload"
              className="inline-flex items-center gap-2 rounded-lg bg-seeker-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-seeker-700"
            >
              📤 上传简历
            </a>
            <button
              type="button"
              onClick={handleCreateBlank}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-lg border border-seeker-300 bg-white px-4 py-2 text-sm font-medium text-seeker-700 shadow-sm transition-colors hover:bg-seeker-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-seeker-700 dark:bg-slate-900 dark:text-seeker-300 dark:hover:bg-seeker-950/30"
            >
              {creating ? '创建中…' : '🆕 新建空白简历'}
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-seeker-600">求职者模式 · /seeker/editor</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">我的简历</h1>
            <p className="text-sm text-slate-500">选择一份简历进入编辑器，或使用 AI 助手进行润色和优化。</p>
          </div>
          <button
            type="button"
            onClick={handleCreateBlank}
            disabled={creating}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-seeker-300 bg-white px-3 py-2 text-sm font-medium text-seeker-700 shadow-sm transition-colors hover:bg-seeker-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-seeker-700 dark:bg-slate-900 dark:text-seeker-300 dark:hover:bg-seeker-950/30"
            title="不上传文件，直接进入编辑器从零开始"
          >
            {creating ? '创建中…' : '🆕 新建空白简历'}
          </button>
        </div>
      </header>
      <ul className="space-y-3">
        {resumes.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-seeker-400 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              {editingId === r.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">#{r.id} ·</span>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void submitRename(r.id)
                      if (e.key === 'Escape') cancelRename()
                    }}
                    autoFocus
                    className="w-full rounded-md border border-seeker-400 px-2 py-1 text-sm outline-none dark:border-seeker-500 dark:bg-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() => void submitRename(r.id)}
                    disabled={savingId === r.id}
                    className="rounded-md bg-seeker-600 px-2 py-1 text-xs font-medium text-white hover:bg-seeker-700 disabled:opacity-60"
                  >
                    {savingId === r.id ? '保存中…' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelRename}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => startRename(r)}
                  className="text-left"
                  title="点击重命名"
                >
                  <p className="text-sm font-medium text-slate-800 hover:text-seeker-600 dark:text-slate-100 dark:hover:text-seeker-400">
                    #{r.id} · {r.filename}
                  </p>
                </button>
              )}
              <p className="text-xs text-slate-500">
                上传于 {formatDateTime(r.created_at)} · {r.raw_text?.length ?? 0} 字符
              </p>
            </div>
            <div className="ml-4 flex items-center gap-2">
              {onSelect && (
                <button
                  type="button"
                  onClick={() => onSelect?.(r.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-seeker-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-seeker-700"
                >
                  ✏️ 编辑
                </button>
              )}
              <button
                type="button"
                onClick={() => handleDelete(r.id)}
                disabled={deletingId === r.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 shadow-sm transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
              >
                {deletingId === r.id ? '删除中…' : '🗑️ 删除'}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
