import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api, ApiError } from '../../api/client'
import { useConfig } from '../../hooks/useConfig'
import type { JobResponse } from '../../api/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

type SubmitState =
  | { status: 'idle' }
  | { status: 'analyzing' }
  | { status: 'error'; message: string }

/**
 * SeekerAnalyze — /seeker/analyze
 * Phase 7c: 分析档案(master_pool) vs JD，不生成简历。
 * 分析结果始终保存入库，用户可在历史记录中回看。
 */
export function SeekerAnalyze() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { state: cfgState } = useConfig()

  const [jobs, setJobs] = useState<JobResponse[]>([])
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [submit, setSubmit] = useState<SubmitState>({ status: 'idle' })
  const [jobId, setJobId] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        const j = await api.jobs.list()
        if (cancelled) return
        setJobs(j)
        const urlJ = searchParams.get('job_id')
        const preJobId = urlJ ? Number(urlJ) : j[0]?.id ?? null
        if (preJobId) setJobId(preJobId)
        if (!cancelled) setLoad({ status: 'ready' })
      } catch (err) {
        if (cancelled) return
        const msg =
          err instanceof ApiError
            ? `HTTP ${err.status} 加载失败`
            : err instanceof Error
              ? err.message
              : 'unknown error'
        setLoad({ status: 'error', message: msg })
      }
    }
    void init()
    return () => { cancelled = true }
  }, [searchParams])

  const onAnalyze = async () => {
    if (jobId == null) return
    setSubmit({ status: 'analyzing' })
    try {
      const result = await api.seekerPool.analyze(jobId)
      navigate(`/seeker/result/${result.analysis_id}`)
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

  if (load.status === 'loading') {
    return (
      <section className="mx-auto max-w-3xl py-12 text-center text-slate-500">加载岗位池...</section>
    )
  }
  if (load.status === 'error') {
    return (
      <section className="mx-auto max-w-3xl py-12 text-center text-red-600">
        ❌ {load.message}
      </section>
    )
  }

  const empty = jobs.length === 0
  const currentLLM = cfgState.status === 'ready' ? cfgState.config : null

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-seeker-600">求职者模式 · /seeker/analyze</p>
        <h1 className="text-2xl font-semibold tracking-tight">分析档案与岗位契合度</h1>
        <p className="text-sm text-slate-500">
          基于当前档案（Master Pool）评估与目标 JD 的匹配度，给出是否值得投递的建议。
          分析结果会自动保存，可在「历史记录」中回看。
          {currentLLM && (
            <>
              {' '}当前使用：
              <code className="ml-1 rounded bg-slate-100 px-1 dark:bg-slate-800">
                {currentLLM.provider_type} / {currentLLM.model_name}
              </code>
            </>
          )}
        </p>
      </header>

      {empty ? (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">先准备数据：</p>
          <ul className="space-y-1 text-sm text-amber-900 dark:text-amber-200">
            <li>
              • JD 池为空 →{' '}
              <Link to="/seeker/jobs" className="underline">
                去 /seeker/jobs 录入
              </Link>
            </li>
          </ul>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">选择目标岗位</span>
            <select
              value={jobId ?? ''}
              onChange={(e) => setJobId(Number(e.target.value))}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  #{j.id} · {j.position ?? '(未命名)'} {j.company ? `@ ${j.company}` : ''}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onAnalyze}
              disabled={submit.status === 'analyzing' || jobId == null}
              className="rounded-lg bg-seeker-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-seeker-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submit.status === 'analyzing' ? '分析中...' : '开始分析'}
            </button>
            <Link to="/settings" className="text-xs text-slate-500 hover:underline">
              切换 LLM provider →
            </Link>
            {submit.status === 'error' && (
              <span className="text-xs text-red-600 dark:text-red-400">{submit.message}</span>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
