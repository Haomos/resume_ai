import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../../api/client'
import type { ResumeResponse } from '../../api/types'
import { formatDateTime } from '../../utils/datetime'

// 与 backend/app/config.py 的 allowed_extensions / max_file_size 同步
const ALLOWED_EXT = ['pdf', 'docx', 'html', 'txt', 'png', 'jpg', 'jpeg'] as const
const MAX_BYTES = 20 * 1024 * 1024 // 20 MB
const MAX_HISTORY = 10

type UploadStatus =
  | { status: 'idle' }
  | { status: 'uploading'; filename: string }
  | { status: 'success'; resume: ResumeResponse }
  | { status: 'error'; message: string }

function getExt(filename: string): string {
  const idx = filename.lastIndexOf('.')
  return idx === -1 ? '' : filename.slice(idx + 1).toLowerCase()
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

interface ValidationResult {
  ok: boolean
  reason?: string
}

function validate(file: File): ValidationResult {
  const ext = getExt(file.name)
  if (!ALLOWED_EXT.includes(ext as (typeof ALLOWED_EXT)[number])) {
    return { ok: false, reason: `不支持的文件类型: .${ext}（允许: ${ALLOWED_EXT.join(', ')}）` }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, reason: `文件过大: ${fmtBytes(file.size)} > 20 MB 上限` }
  }
  if (file.size === 0) {
    return { ok: false, reason: '空文件' }
  }
  return { ok: true }
}

/**
 * SeekerUpload — /seeker/upload
 *  - 拖拽 / 点击选择单个简历文件
 *  - 前端预校验（扩展名 + 大小），通过后才发 POST /api/resumes/upload
 *  - 上传成功后显示结果卡片 + 加入"本次会话已上传"列表
 *  - 多文件 / zip 解析: Phase 2b 招聘者模式批量上传时再做
 */
export function SeekerUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [state, setState] = useState<UploadStatus>({ status: 'idle' })
  const [recent, setRecent] = useState<ResumeResponse[]>([])

  const pickFromInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) selectFile(f)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const selectFile = (file: File) => {
    const v = validate(file)
    if (!v.ok) {
      setPending(null)
      setState({ status: 'error', message: v.reason ?? 'invalid file' })
      return
    }
    setPending(file)
    setState({ status: 'idle' })
  }

  const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(true)
  }
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
  }
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) selectFile(f)
  }

  const upload = async () => {
    if (!pending) return
    setState({ status: 'uploading', filename: pending.name })
    try {
      const isRecruiter = window.location.pathname.startsWith('/recruiter')
      const resume = await api.resumes.upload(pending, isRecruiter ? 'candidate' : undefined)
      setState({ status: 'success', resume })
      setRecent((prev) => [resume, ...prev].slice(0, MAX_HISTORY))
      setPending(null)
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `HTTP ${err.status} · ${typeof err.body === 'string' ? err.body : JSON.stringify(err.body)}`
          : err instanceof Error
            ? err.message
            : 'unknown error'
      setState({ status: 'error', message: msg })
    }
  }

  const reset = () => {
    setPending(null)
    setState({ status: 'idle' })
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-seeker-600">求职者模式 · /seeker/upload</p>
        <h1 className="text-2xl font-semibold tracking-tight">上传简历</h1>
        <p className="text-sm text-slate-500">
          支持 {ALLOWED_EXT.join(' / ')} ，单文件 ≤ 20 MB。文件保存在本地 SQLite + 磁盘，不会上传到任何外部服务。
        </p>
      </header>

      <div
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={[
          'cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors',
          dragOver
            ? 'border-seeker-500 bg-seeker-50 dark:bg-seeker-500/10'
            : 'border-slate-300 bg-slate-50 hover:border-seeker-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-seeker-500',
        ].join(' ')}
      >
        <p className="text-base font-medium text-slate-700 dark:text-slate-200">
          {pending ? '✓ 文件已选好，点击下方"上传"按钮' : '拖拽文件到此处，或点击选择'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {dragOver ? '松手即可选定文件' : '随时可拖拽新文件覆盖当前选择'}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_EXT.map((e) => `.${e}`).join(',')}
          onChange={pickFromInput}
          className="hidden"
        />
      </div>

      {pending && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{pending.name}</p>
            <p className="text-xs text-slate-500">
              {fmtBytes(pending.size)} · {getExt(pending.name).toUpperCase() || '(no ext)'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={upload}
              disabled={state.status === 'uploading'}
              className="inline-flex items-center gap-2 rounded-lg bg-seeker-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-seeker-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state.status === 'uploading' ? '上传中...' : '上传'}
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={state.status === 'uploading'}
              className="text-xs text-slate-500 hover:underline disabled:opacity-60"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          ❌ {state.message}
        </div>
      )}
      {state.status === 'success' && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          <p>
            ✅ 已保存简历 <strong>#{state.resume.id}</strong> · {state.resume.filename} ·{' '}
            {formatDateTime(state.resume.created_at)}
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              已标记为 legacy
            </span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              to={`/seeker/pool/import?resume_id=${state.resume.id}`}
              className="inline-flex items-center gap-1.5 rounded-md bg-seeker-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-seeker-700"
            >
              📁 导入到档案
            </Link>
            <Link
              to="/seeker/jobs"
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 shadow-sm transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-200"
            >
              🎯 去录入目标 JD
            </Link>
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            本次会话已上传（{recent.length}）
          </h2>
          <ul className="space-y-2">
            {recent.map((r) => (
              <li
                key={r.id}
                className="rounded-lg border border-slate-200 bg-white p-3 text-sm shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    #{r.id} · {r.filename}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(r.created_at)}
                  </span>
                </div>
                <p className="text-xs text-slate-500">📁 {r.storage_path}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Link
                    to={`/seeker/editor/${r.id}`}
                    className="inline-block text-xs text-seeker-600 hover:underline"
                  >
                    ✏️ 编辑
                  </Link>
                  <Link
                    to={`/seeker/jobs`}
                    className="inline-block text-xs text-seeker-600 hover:underline"
                  >
                    🎯 录入 JD
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
