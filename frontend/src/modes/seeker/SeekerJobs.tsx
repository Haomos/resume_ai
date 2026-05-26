import { useState, useEffect, type FormEvent, type ReactNode } from 'react'
import toast from 'react-hot-toast'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../api/client'
import type { JobCreate, JobResponse } from '../../api/types'
import { JobExtractButton, type ExtractState } from './_jobs/JobExtractButton'

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
  | { status: 'blocked'; url: string }

// §8.17 ExtractState 已搬到 ./_jobs/JobExtractButton.tsx 以守 500 行红线

const EMPTY_FORM: JobCreate = {
  source_url: '',
  company: '',
  position: '',
  salary_min: null,
  salary_max: null,
  location: '',
  raw_text: '',
}

function trimOrNull(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null
  const t = v.trim()
  return t.length === 0 ? null : t
}

function numOrNull(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (Number.isNaN(v)) return null
  return v
}

const inputCls =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-slate-400 focus:border-seeker-500 focus:outline-none focus:ring-2 focus:ring-seeker-500/20 dark:border-slate-700 dark:bg-slate-950'

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
    </label>
  )
}

/**
 * SeekerJobs — /seeker/jobs
 *  - 表单录入岗位描述（POST /api/jobs）
 *  - raw_text 必填，其余字段可选
 *  - 提交成功后显示卡片 + 加入"本次会话已录入"内存列表
 *  - 后端尚未实现 GET /api/jobs（list），暂以前端 state 充当 session-scoped history
 */
export function SeekerJobs() {
  const [form, setForm] = useState<JobCreate>(EMPTY_FORM)
  const [submit, setSubmit] = useState<SubmitState>({ status: 'idle' })
  const [editingJobId, setEditingJobId] = useState<number | null>(null)
  // Phase 4 — URL 抓取（preview only，不写库；用户审阅后再点保存）
  const [fetchUrl, setFetchUrl] = useState('')
  const [fetchState, setFetchState] = useState<FetchState>({ status: 'idle' })
  // §8.17 LLM 智能识别（从粘贴的 JD 文本里抽取 position/company/salary/location）
  const [extractState, setExtractState] = useState<ExtractState>({ status: 'idle' })

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

  const updateField = <K extends keyof JobCreate>(key: K, value: JobCreate[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    // 用户改了任何字段后，重置 fetch / extract 提示（避免误导）
    if (fetchState.status === 'success') setFetchState({ status: 'idle' })
    if (extractState.status === 'success' || extractState.status === 'error')
      setExtractState({ status: 'idle' })
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
    setForm(EMPTY_FORM)
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
      // 自动填充正文 + 来源链接，其他字段交给用户人工补
      setForm((prev) => ({
        ...prev,
        raw_text: preview.raw_text,
        source_url: preview.source_url,
      }))
      setFetchState({ status: 'success', chars: preview.raw_text.length })
      setSubmit({ status: 'idle' })
    } catch (err) {
      if (err instanceof ApiError && (err.status === 502 || err.status === 422)) {
        // 反爬拦截或提取为空 → 引导用户手动降级路径
        setFetchState({ status: 'blocked', url })
      } else {
        const msg =
          err instanceof ApiError
            ? `HTTP ${err.status} · ${typeof err.body === 'string' ? err.body : JSON.stringify(err.body)}`
            : err instanceof Error
              ? err.message
              : '抓取失败'
        setFetchState({ status: 'error', message: msg })
      }
    }
  }

  /**
   * §8.17 LLM 智能识别：从用户粘贴的整段 JD 文本里抽取 5 个关键字段，
   * 自动填充表单的空字段（不覆盖用户已手填内容）。
   *
   * 端点失败 / LLM 没配置时返回 ok=false + error 字符串，前端友好显示
   * 错误（不 alert，跟 autosave 风格一致）。
   */
  const onExtract = async () => {
    const raw = form.raw_text.trim()
    if (raw.length < 10) {
      setExtractState({ status: 'error', message: 'JD 文本至少需要 10 个字符' })
      return
    }
    setExtractState({ status: 'extracting' })
    try {
      const result = await api.jobs.extract({ raw_text: raw })
      if (!result.ok) {
        setExtractState({ status: 'error', message: result.error || '识别失败' })
        return
      }

      // 只填用户当前为空的字段，不覆盖用户已填的内容
      const isEmptyStr = (v: string | null | undefined) =>
        v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
      const isEmptyNum = (v: number | null | undefined) => v === null || v === undefined

      let filled = 0
      setForm((prev) => {
        const next = { ...prev }
        if (result.position && isEmptyStr(prev.position)) {
          next.position = result.position
          filled++
        }
        if (result.company && isEmptyStr(prev.company)) {
          next.company = result.company
          filled++
        }
        if (result.salary_min !== null && isEmptyNum(prev.salary_min)) {
          next.salary_min = result.salary_min
          filled++
        }
        if (result.salary_max !== null && isEmptyNum(prev.salary_max)) {
          next.salary_max = result.salary_max
          filled++
        }
        if (result.location && isEmptyStr(prev.location)) {
          next.location = result.location
          filled++
        }
        return next
      })
      setExtractState({ status: 'success', filled, model: result.model })
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `HTTP ${err.status}`
          : err instanceof Error
            ? err.message
            : 'unknown error'
      setExtractState({ status: 'error', message: msg })
    }
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const raw = form.raw_text.trim()
    if (!raw) {
      setSubmit({ status: 'error', message: '岗位描述（raw_text）必填' })
      return
    }
    const position = trimOrNull(form.position)
    if (!position) {
      setSubmit({ status: 'error', message: '职位名称必填，请为岗位命名以便后续区分' })
      return
    }

    const payload: JobCreate = {
      source_url: trimOrNull(form.source_url),
      company:    trimOrNull(form.company),
      position:   trimOrNull(form.position),
      location:   trimOrNull(form.location),
      salary_min: numOrNull(form.salary_min),
      salary_max: numOrNull(form.salary_max),
      raw_text:   raw,
    }

    setSubmit({ status: 'submitting' })
    try {
      if (editingJobId != null) {
        await api.jobs.update(editingJobId, payload)
        navigate('/seeker/jobs/manage')
      } else {
        await api.jobs.create(payload)
        navigate('/seeker/jobs/manage')
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `HTTP ${err.status} · ${typeof err.body === 'string' ? err.body : JSON.stringify(err.body)}`
          : err instanceof Error
            ? err.message
            : 'unknown error'
      setSubmit({ status: 'error', message: msg })
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-seeker-600">求职者模式 · /seeker/jobs</p>
        <h1 className="text-2xl font-semibold tracking-tight">录入目标岗位 (JD)</h1>
        <p className="text-sm text-slate-500">
          仅"岗位描述"必填；其他字段用于后续薪资 / 地理 / 公司维度评分。
        </p>
      </header>

      {/* Phase 4 — 链接抓取（推荐） */}
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-5 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
            🔗 从招聘链接自动抓取
            <span className="rounded-full bg-seeker-100 px-2 py-0.5 text-[10px] text-seeker-700 dark:bg-seeker-500/20 dark:text-seeker-300">
              推荐
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            Boss 直聘 / 智联 / LinkedIn / 拉勾 等大多数站点。提取的正文会自动填入下方"岗位描述"，公司 / 薪资 / 地点等字段请你审核后补充。
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
            ✅ 已抓取 {fetchState.chars} 字符到下方"岗位描述"。请审核内容是否完整，必要时手动补充公司 / 薪资 / 地点。
          </p>
        )}
        {fetchState.status === 'error' && (
          <p className="text-xs text-red-600 dark:text-red-400">
            ❌ {fetchState.message}
            <span className="mt-1 block text-[11px] text-slate-400">
              提示：部分站点（如 Boss）反爬较强，可能需要直接粘贴 JD 文本到下方表单。
            </span>
          </p>
        )}
        {fetchState.status === 'blocked' && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
              ⚠️ 该网站有反爬保护，自动抓取失败
            </p>
            <ol className="mt-2 space-y-1 text-xs text-amber-800 dark:text-amber-300">
              <li>1. 点击下方按钮复制链接，在自己的浏览器中打开</li>
              <li>2. 复制页面中的<strong>职位描述</strong>文本</li>
              <li>3. 粘贴到下方表单中的"岗位描述"文本框</li>
            </ol>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(fetchState.url)
                    .then(() => toast.success('链接已复制到剪贴板'))
                    .catch(() => {
                      // fallback: 选中文本让用户手动复制
                      const input = document.createElement('input')
                      input.value = fetchState.url
                      document.body.appendChild(input)
                      input.select()
                      const ok = document.execCommand('copy')
                      document.body.removeChild(input)
                      if (ok) { toast.success('链接已复制') } else { toast.error('复制失败，请手动选择链接复制') }
                    })
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 shadow-sm transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200 dark:hover:bg-amber-900/30"
              >
                📋 复制链接
              </button>
              <button
                type="button"
                onClick={() => {
                  setFetchState({ status: 'idle' })
                  // 自动聚焦到 raw_text textarea（如果存在）
                  document.getElementById('jd-raw-text')?.focus()
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
              >
                📄 我已复制，去粘贴
              </button>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:bg-slate-900 dark:border-slate-800"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="公司">
            <input
              type="text"
              value={form.company ?? ''}
              onChange={(e) => updateField('company', e.target.value)}
              className={inputCls}
              placeholder="例: 字节跳动"
            />
          </Field>
          <Field label="职位 *" hint="必填，用于在列表中区分不同岗位">
            <input
              type="text"
              value={form.position ?? ''}
              onChange={(e) => updateField('position', e.target.value)}
              className={inputCls}
              placeholder="例: 高级后端工程师"
            />
          </Field>
          <Field label="地点">
            <input
              type="text"
              value={form.location ?? ''}
              onChange={(e) => updateField('location', e.target.value)}
              className={inputCls}
              placeholder="例: 北京 / 远程"
            />
          </Field>
          <Field label="来源链接">
            <input
              type="url"
              value={form.source_url ?? ''}
              onChange={(e) => updateField('source_url', e.target.value)}
              className={inputCls}
              placeholder="https://..."
            />
          </Field>
          <Field label="薪资下限 (k)">
            <input
              type="number"
              min={0}
              step={1}
              value={form.salary_min ?? ''}
              onChange={(e) =>
                updateField('salary_min', e.target.value === '' ? null : Number(e.target.value))
              }
              className={inputCls}
              placeholder="20"
            />
          </Field>
          <Field label="薪资上限 (k)">
            <input
              type="number"
              min={0}
              step={1}
              value={form.salary_max ?? ''}
              onChange={(e) =>
                updateField('salary_max', e.target.value === '' ? null : Number(e.target.value))
              }
              className={inputCls}
              placeholder="40"
            />
          </Field>
        </div>

        <Field label="岗位描述 (raw_text) *" hint="粘贴 JD 完整正文，至少几行内容才能被有效评分">
          <textarea
            id="jd-raw-text"
            value={form.raw_text}
            onChange={(e) => updateField('raw_text', e.target.value)}
            className={`${inputCls} min-h-[180px] resize-y font-mono text-xs`}
            placeholder={'岗位职责...\n任职要求...\n加分项...'}
            required
          />
        </Field>

        {/* §8.17 LLM 智能识别按钮 — 子组件在 ./_jobs/JobExtractButton.tsx */}
        <JobExtractButton rawText={form.raw_text} state={extractState} onClick={onExtract} />

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submit.status === 'submitting'}
            className="inline-flex items-center gap-2 rounded-lg bg-seeker-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-seeker-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submit.status === 'submitting' ? '提交中...' : editingJobId != null ? `更新岗位 #${editingJobId}` : '保存岗位'}
          </button>
          {editingJobId != null && (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              取消编辑
            </button>
          )}
          {submit.status === 'error' && (
            <span className="text-sm text-red-600 dark:text-red-400">{submit.message}</span>
          )}
        </div>
      </form>

    </section>
  )
}
