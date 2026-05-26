import { useEffect, useRef, useState } from 'react'
import { SkeletonPage } from '../../shared/Skeleton'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../../api/client'
import { useConfig } from '../../hooks/useConfig'
import type { JobResponse, ResumeResponse } from '../../api/types'
import {
  subscribeBatchProgress,
  saveActiveBatch,
  clearActiveBatch,
  loadActiveBatch,
} from './_score/batchProgressClient'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'error'; message: string }

type SubmitState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'polling'; batchId: string; completed: number; total: number; channel: 'sse' | 'poll' }
  // 'done' 状态分三档：用 results.length 校验真相，揭穿 backend "completed" 的谎言
  // - kind='success' 时 success === total
  // - kind='partial' 时 success < total（BE 报 completed 但 LLM 失败若干 → 静默吞）
  // - kind='failed'  时 BE 报 status=failed（多半是 _run_batch 整个崩了）
  | {
      status: 'done'
      batchId: string
      kind: 'success' | 'partial' | 'failed'
      success: number
      total: number
      backendStatus: 'completed' | 'failed'
    }
  | { status: 'error'; message: string }

export function RecruiterScore() {
  const navigate = useNavigate()
  const { state: configState } = useConfig()
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [jobs, setJobs] = useState<JobResponse[]>([])
  const [resumes, setResumes] = useState<ResumeResponse[]>([])
  const [jobId, setJobId] = useState<number | null>(null)
  const [selectedResumes, setSelectedResumes] = useState<Set<number>>(new Set())
  const [submit, setSubmit] = useState<SubmitState>({ status: 'idle' })
  // Bug 4: 并发可选 — 默认根据 provider 推（ollama 用 1 防 502，云端用 5）
  // 用户可手动切到任意值；UI 通过 radio 三档（1/2/5）展示
  const [concurrency, setConcurrency] = useState<number>(5)
  const cleanupRef = useRef<(() => void) | null>(null)
  const masterCheckboxRef = useRef<HTMLInputElement>(null)

  // Bug 4: 配置加载完才能算 default — Ollama 默认 1（小型部署 502 概率高），其余 5
  // 用 queueMicrotask 避免 React 19 set-state-in-effect 级联渲染
  useEffect(() => {
    if (configState.status === 'ready') {
      const isOllama = configState.config.provider_type === 'ollama'
      queueMicrotask(() => setConcurrency(isOllama ? 1 : 5))
    }
  }, [configState])

  // Issue B2: master checkbox indeterminate（半选）状态 — React 不支持 JSX 直接绑定，需用 ref
  useEffect(() => {
    if (masterCheckboxRef.current && resumes.length > 0) {
      const partial = selectedResumes.size > 0 && selectedResumes.size < resumes.length
      masterCheckboxRef.current.indeterminate = partial
    }
  }, [selectedResumes, resumes])

  /** 抓 batch 终态 + Analysis 行数，决定显示 success/partial/failed —
   *  揭穿 BE "completed" 的谎言（_one 静默吞 LLM 失败 → counter 还是 +1，但无 Analysis 入库） */
  const buildDoneState = async (batchId: string): Promise<SubmitState> => {
    const s = await api.analysis.batch.get(batchId)
    const success = s.results?.length ?? 0
    const backendStatus = s.status === 'failed' ? 'failed' : 'completed'
    let kind: 'success' | 'partial' | 'failed'
    if (backendStatus === 'failed') {
      kind = 'failed'
    } else if (success >= s.total) {
      kind = 'success'
    } else {
      kind = 'partial'
    }
    return {
      status: 'done',
      batchId,
      kind,
      success,
      total: s.total,
      backendStatus,
    }
  }

  /** 订阅 batch 进度并保存清理句柄；onDone 时清 storage. */
  const subscribeAndTrack = (batchId: string) => {
    cleanupRef.current = subscribeBatchProgress(batchId, {
      onProgress: (p) => {
        setSubmit({
          status: 'polling',
          batchId,
          completed: p.completed,
          total: p.total,
          channel: 'sse',
        })
      },
      onDone: () => {
        clearActiveBatch()
        cleanupRef.current = null
        // 终态后多查一次拿真实 success/total，避免 BE counter 撒谎
        void buildDoneState(batchId).then(setSubmit).catch(() => {
          // 兜底：拉不到也至少显示一个不撒谎的简单态
          setSubmit({
            status: 'done',
            batchId,
            kind: 'partial',
            success: 0,
            total: 0,
            backendStatus: 'completed',
          })
        })
      },
    })
  }

  useEffect(() => {
    let cancelled = false

    /** 检查 localStorage 是否有未完成的 batch — 有则恢复订阅或显示终态. */
    const tryResumeBatch = async () => {
      const stored = loadActiveBatch()
      if (!stored) return

      try {
        const status = await api.analysis.batch.get(stored)
        if (cancelled) return
        if (status.status === 'completed' || status.status === 'failed') {
          // 跑完了 — 用 buildDoneState 拿真相（success vs total）
          clearActiveBatch()
          const done = await buildDoneState(stored)
          if (!cancelled) setSubmit(done)
        } else {
          // 还在跑 — 恢复 SSE 订阅
          setSubmit({
            status: 'polling',
            batchId: stored,
            completed: status.completed,
            total: status.total,
            channel: 'sse',
          })
          subscribeAndTrack(stored)
        }
      } catch (err) {
        // 404（batch 已删）或网络错误 — 清掉 storage 静默继续
        if (err instanceof ApiError && err.status === 404) {
          clearActiveBatch()
        }
      }
    }

    Promise.all([api.jobs.list(), api.resumes.list(50, 0, 'candidate')])
      .then(([j, r]) => {
        if (cancelled) return
        setJobs(j)
        setResumes(r)
        if (j.length > 0) setJobId(j[0].id)
        setLoad({ status: 'ready' })
        // 列表加载完才尝试恢复 — 这样 jobId/resumes UI 已就绪可与恢复态共存
        void tryResumeBatch()
      })
      .catch((err) => {
        if (cancelled) return
        const msg = err instanceof ApiError ? `HTTP ${err.status}` : err instanceof Error ? err.message : 'error'
        setLoad({ status: 'error', message: msg })
      })
    return () => {
      cancelled = true
      // 卸载时关闭活动的 SSE/轮询（storage 不清，下次 mount 会重连）
      if (cleanupRef.current) {
        cleanupRef.current()
        cleanupRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleResume = (id: number) => {
    setSelectedResumes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    setSelectedResumes(new Set(resumes.map((r) => r.id)))
  }
  const clearAll = () => setSelectedResumes(new Set())

  /** Issue B2: master checkbox 智能切换 — 全选时点变清空，否则一键全选 */
  const toggleAll = () => {
    if (selectedResumes.size === resumes.length && resumes.length > 0) {
      clearAll()
    } else {
      selectAll()
    }
  }

  const onStart = async () => {
    if (jobId == null || selectedResumes.size === 0) return
    // 启动前关掉残留订阅（恢复态切到新 batch 的边缘场景）
    if (cleanupRef.current) {
      cleanupRef.current()
      cleanupRef.current = null
    }
    setSubmit({ status: 'submitting' })
    try {
      const resp = await api.analysis.batch.create(jobId, Array.from(selectedResumes), concurrency)
      saveActiveBatch(resp.batch_id)  // 持久化：跳走再回来能恢复
      setSubmit({
        status: 'polling',
        batchId: resp.batch_id,
        completed: 0,
        total: resp.total,
        channel: 'sse',
      })
      subscribeAndTrack(resp.batch_id)
    } catch (err) {
      const msg = err instanceof ApiError
        ? `HTTP ${err.status} · ${typeof err.body === 'string' ? err.body : JSON.stringify(err.body)}`
        : err instanceof Error ? err.message : 'error'
      setSubmit({ status: 'error', message: msg })
    }
  }

  if (load.status === 'loading') {
    return <SkeletonPage />
  }
  if (load.status === 'error') {
    return <section className="mx-auto max-w-4xl py-12 text-center text-red-600">❌ {load.message}</section>
  }

  const emptyJobs = jobs.length === 0
  const emptyResumes = resumes.length === 0

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-recruiter-600">招聘者模式 · /recruiter/score</p>
        <h1 className="text-2xl font-semibold tracking-tight">批量评分</h1>
        <p className="text-sm text-slate-500">选定 1 个 JD + N 份简历，后台并发跑 LLM 评分，实时查看进度。</p>
      </header>

      {(emptyJobs || emptyResumes) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">先准备数据：</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900 dark:text-amber-200">
            {emptyJobs && <li>• JD 池为空 → 去录入岗位 JD</li>}
            {emptyResumes && <li>• 简历池为空 → 去 /recruiter/upload 上传简历（招聘者独立简历池）</li>}
          </ul>
        </div>
      )}

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">选择目标岗位 JD</span>
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

        {/* Bug 4: 并发选择器 — Ollama 默认 1（防 502），云端默认 5；用户可手动切 */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">并发数</span>
            {configState.status === 'ready' && configState.config.provider_type === 'ollama' && concurrency > 1 && (
              <span className="text-[11px] text-amber-700 dark:text-amber-400" title="本地 Ollama 在并发评分时易出现 502 Bad Gateway，建议用'串行（1）'">
                ⚠ Ollama 推荐串行
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {[
              { val: 1, label: '串行（1）', hint: '逐份评分，最稳；适合本地 Ollama' },
              { val: 2, label: '2 并发', hint: '中等并发，云端 LLM 稳定' },
              { val: 5, label: '5 并发', hint: '最高并发，云端 LLM 推荐' },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                onClick={() => setConcurrency(opt.val)}
                disabled={submit.status === 'submitting' || submit.status === 'polling'}
                title={opt.hint}
                className={[
                  'flex-1 rounded-md border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  concurrency === opt.val
                    ? 'border-recruiter-500 bg-recruiter-50 text-recruiter-700 dark:border-recruiter-400 dark:bg-recruiter-950/40 dark:text-recruiter-300'
                    : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {/* Issue B2: 列表头改 master checkbox + 醒目按钮，原 text-xs link 太弱视觉用户认不出 */}
          <div className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                ref={masterCheckboxRef}
                type="checkbox"
                checked={selectedResumes.size === resumes.length && resumes.length > 0}
                onChange={toggleAll}
                disabled={resumes.length === 0}
                className="h-4 w-4 rounded border-slate-400 accent-recruiter-600 disabled:cursor-not-allowed"
              />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {selectedResumes.size === 0
                  ? `全选简历（共 ${resumes.length} 份）`
                  : selectedResumes.size === resumes.length
                    ? `✓ 已全选（${resumes.length} 份）`
                    : `已选 ${selectedResumes.size} / ${resumes.length}`}
              </span>
            </label>
            {selectedResumes.size > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                清空
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
            {resumes.map((r) => (
              <label
                key={r.id}
                className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedResumes.has(r.id)}
                  onChange={() => toggleResume(r.id)}
                  className="h-4 w-4 rounded border-slate-300 accent-recruiter-600"
                />
                <span className="text-sm">
                  #{r.id} · {r.filename}
                  {r.raw_text == null && <span className="ml-1 text-[10px] text-amber-600">(文本未抽取)</span>}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onStart}
            disabled={
              submit.status === 'submitting' ||
              submit.status === 'polling' ||
              jobId == null ||
              selectedResumes.size === 0
            }
            className="inline-flex items-center gap-2 rounded-lg bg-recruiter-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-recruiter-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submit.status === 'idle' && '开始批量评分'}
            {submit.status === 'submitting' && '提交中...'}
            {submit.status === 'polling' && `评分中 ${submit.completed}/${submit.total}...`}
            {submit.status === 'done' && '开始新批次'}
            {submit.status === 'error' && '重试'}
          </button>
          {submit.status === 'polling' && (
            <div className="h-2 w-32 rounded-full bg-white/10">
              <div
                className="h-2 rounded-full bg-recruiter-500 transition-all"
                style={{ width: `${submit.total > 0 ? (submit.completed / submit.total) * 100 : 0}%` }}
              />
            </div>
          )}
          {submit.status === 'done' && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {submit.kind === 'success' && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  ✓ 上次批次全部完成（{submit.success}/{submit.total}）
                </span>
              )}
              {submit.kind === 'partial' && (
                <>
                  <span
                    className="text-amber-700 dark:text-amber-400"
                    title="后端 batch.status=completed 但 Analysis 行数 < total — 多半是 LLM 调用失败被静默吞掉。检查后端 log 找 'LLM analyze failed' / 'Batch X resume Y failed:'"
                  >
                    ⚠ 部分完成 {submit.success}/{submit.total}（{submit.total - submit.success} 条评分失败 — 多半 LLM 报错，详见后端 log）
                  </span>
                  {/* Bug 4: partial 失败 ≥ 2 条时主动建议切串行 */}
                  {submit.total - submit.success >= 2 && concurrency > 1 && (
                    <button
                      type="button"
                      onClick={() => setConcurrency(1)}
                      className="rounded-md border border-amber-400 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
                      title="切换到串行（concurrency=1），下次重试时点'开始新批次'即可重跑"
                    >
                      → 切到串行重试
                    </button>
                  )}
                </>
              )}
              {submit.kind === 'failed' && (
                <span className="text-red-700 dark:text-red-400">
                  ❌ 批次中断：仅 {submit.success}/{submit.total} 条入库
                </span>
              )}
              <button
                type="button"
                onClick={() => navigate(`/recruiter/leaderboard/${submit.batchId}`)}
                className="text-recruiter-600 hover:underline"
              >
                → 查看排行榜
              </button>
            </div>
          )}
          {submit.status === 'error' && <span className="text-xs text-red-600">{submit.message}</span>}
        </div>
      </div>
    </section>
  )
}
