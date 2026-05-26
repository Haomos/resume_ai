import { useState, useEffect, type FormEvent } from 'react'
import toast from 'react-hot-toast'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../api/client'
import type { JobCreate, JobResponse } from '../../api/types'

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; job: JobResponse }
  | { status: 'error'; message: string }

type FetchState =
  | { status: 'idle' }
  | { status: 'fetching' }
  | { status: 'success'; chars: number }
  | { status: 'error'; message: string }

const EMPTY: JobCreate = {
  source_url: '',
  company: '',
  position: '',
  salary_min: null,
  salary_max: null,
  location: '',
  raw_text: '',
}

const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-slate-400 focus:border-recruiter-500 focus:outline-none focus:ring-2 focus:ring-recruiter-500/20 dark:border-slate-700 dark:bg-slate-950'

/**
 * RecruiterJobs — /recruiter/jobs
 *  - 与 /seeker/jobs 共用同一 schema 和 API
 *  - 招聘者模式用于录入要批量评分的 JD
 */
export function RecruiterJobs() {
  const [form, setForm] = useState<JobCreate>(EMPTY)
  const [submit, setSubmit] = useState<SubmitState>({ status: 'idle' })
  const [fetchUrl, setFetchUrl] = useState('')
  const [fetchState, setFetchState] = useState<FetchState>({ status: 'idle' })
  const [editingJobId, setEditingJobId] = useState<number | null>(null)

  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const id = searchParams.get('id')
    if (id) {
      api.jobs.get(Number(id))
        .then((job) => {
          setForm({
            source_url: job.source_url ?? '',
            company: job.company ?? '',
            position: job.position ?? '',
            salary_min: job.salary_min,
            salary_max: job.salary_max,
            location: job.location ?? '',
            raw_text: job.raw_text ?? '',
          })
          setEditingJobId(job.id)
          setSubmit({ status: 'idle' })
        })
        .catch(() => {
          toast.error('岗位加载失败，ID 可能已失效')
          setSearchParams({})
        })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const update = <K extends keyof JobCreate>(key: K, value: JobCreate[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    if (fetchState.status === 'success') setFetchState({ status: 'idle' })
  }

  const startEdit = (job: JobResponse) => {
    setForm({
      source_url: job.source_url ?? '',
      company: job.company ?? '',
      position: job.position ?? '',
      salary_min: job.salary_min,
      salary_max: job.salary_max,
      location: job.location ?? '',
      raw_text: job.raw_text ?? '',
    })
    setEditingJobId(job.id)
    setSubmit({ status: 'idle' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  // 2026-05-08 §8.12: kept for the in-flight edit-form refactor — was wired
  // to row buttons before the list-page split in §8.10/§8.11. Touch the
  // symbol so strict `noUnusedLocals` doesn't fail the build until the new
  // edit flow lands.
  void startEdit

  const cancelEdit = () => {
    setForm(EMPTY)
    setEditingJobId(null)
    setSubmit({ status: 'idle' })
  }

  const onFetch = async () => {
    const url = fetchUrl.trim()
    if (!url) {
      setFetchState({ status: 'error', message: '请输入岗位链接' })
      return
    }
    setFetchState({ status: 'fetching' })
    try {
      const preview = await api.jobs.preview(url)
      setForm((prev) => ({ ...prev, raw_text: preview.raw_text, source_url: preview.source_url }))
      setFetchState({ status: 'success', chars: preview.raw_text.length })
      setSubmit({ status: 'idle' })
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `HTTP ${err.status} · ${typeof err.body === 'string' ? err.body : JSON.stringify(err.body)}`
          : err instanceof Error ? err.message : '抓取失败'
      setFetchState({ status: 'error', message: msg })
    }
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const raw = form.raw_text.trim()
    if (!raw) {
      setSubmit({ status: 'error', message: '岗位描述必填' })
      return
    }
    const payload: JobCreate = {
      source_url: form.source_url?.trim() || null,
      company: form.company?.trim() || null,
      position: form.position?.trim() || null,
      location: form.location?.trim() || null,
      salary_min: form.salary_min == null ? null : Number(form.salary_min),
      salary_max: form.salary_max == null ? null : Number(form.salary_max),
      raw_text: raw,
    }
    setSubmit({ status: 'submitting' })
    try {
      if (editingJobId != null) {
        await api.jobs.update(editingJobId, payload)
        navigate('/recruiter/jobs/manage')
      } else {
        await api.jobs.create(payload)
        navigate('/recruiter/jobs/manage')
      }
    } catch (err) {
      const msg = err instanceof ApiError
        ? `HTTP ${err.status} · ${typeof err.body === 'string' ? err.body : JSON.stringify(err.body)}`
        : err instanceof Error ? err.message : 'unknown'
      setSubmit({ status: 'error', message: msg })
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-recruiter-600">招聘者模式 · /recruiter/jobs</p>
        <h1 className="text-2xl font-semibold tracking-tight">录入岗位 JD</h1>
        <p className="text-sm text-slate-500">录入后可在"批量评分"中选择该 JD 对简历池打分。</p>
      </header>

      {/* Phase 4 — 链接抓取 */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-5 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            🔗 从招聘链接自动抓取
            <span className="rounded-full bg-recruiter-100 px-2 py-0.5 text-[10px] text-recruiter-700 dark:bg-recruiter-500/20 dark:text-recruiter-300">
              推荐
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            提取 JD 正文 → 自动填入下方"岗位描述"。其他字段（公司 / 薪资 / 地点）请审核后补充。
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            value={fetchUrl}
            onChange={(e) => setFetchUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void onFetch()
              }
            }}
            disabled={fetchState.status === 'fetching'}
            className={inputCls}
            placeholder="https://www.zhipin.com/job_detail/xxx.html"
          />
          <button
            type="button"
            onClick={onFetch}
            disabled={fetchState.status === 'fetching' || !fetchUrl.trim()}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {fetchState.status === 'fetching' ? '抓取中...' : '🔍 抓取并填充'}
          </button>
        </div>
        {fetchState.status === 'success' && (
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            ✅ 已抓取 {fetchState.chars} 字符到下方"岗位描述"。请审核内容，必要时手动补充其他字段。
          </p>
        )}
        {fetchState.status === 'error' && (
          <p className="text-xs text-red-600 dark:text-red-400">
            ❌ {fetchState.message}
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium">职位</span>
            <input type="text" value={form.position ?? ''} onChange={(e) => update('position', e.target.value)} className={inputCls} placeholder="高级后端工程师" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">公司</span>
            <input type="text" value={form.company ?? ''} onChange={(e) => update('company', e.target.value)} className={inputCls} placeholder="某头部电商" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">地点</span>
            <input type="text" value={form.location ?? ''} onChange={(e) => update('location', e.target.value)} className={inputCls} placeholder="北京 / 远程" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">来源链接</span>
            <input type="url" value={form.source_url ?? ''} onChange={(e) => update('source_url', e.target.value)} className={inputCls} placeholder="https://..." />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">薪资下限 (k)</span>
            <input type="number" value={form.salary_min ?? ''} onChange={(e) => update('salary_min', e.target.value === '' ? null : Number(e.target.value))} className={inputCls} placeholder="30" />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">薪资上限 (k)</span>
            <input type="number" value={form.salary_max ?? ''} onChange={(e) => update('salary_max', e.target.value === '' ? null : Number(e.target.value))} className={inputCls} placeholder="60" />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium">岗位描述 (raw_text) *</span>
          <textarea value={form.raw_text} onChange={(e) => update('raw_text', e.target.value)} className={`${inputCls} min-h-[180px] resize-y font-mono text-xs`} placeholder="岗位职责...\n任职要求...\n加分项..." required />
        </label>
        <div className="flex items-center gap-3">
          <button type="submit" disabled={submit.status === 'submitting'} className="rounded-lg bg-recruiter-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-recruiter-700 disabled:opacity-60">{submit.status === 'submitting' ? '提交中...' : editingJobId != null ? `更新岗位 #${editingJobId}` : '保存岗位'}</button>
          {editingJobId != null && (
            <button type="button" onClick={cancelEdit} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">取消编辑</button>
          )}
          {submit.status === 'error' && <span className="text-sm text-red-600">{submit.message}</span>}
        </div>
      </form>
    </section>
  )
}
