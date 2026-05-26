import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, ApiError } from '../../api/client'
import type { AnalysisResult, JobResponse, ResumeResponse, Assessment, ActionItem, LegacyActionItem } from '../../api/types'
import { formatDateTime } from '../../utils/datetime'
import { AssessmentCard } from '../../shared/AssessmentCard'
import { ResultFitPanel } from './ResultFitPanel'
import { ResultActionBar } from './ResultActionBar'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; analysis: AnalysisResult; resume: ResumeResponse | null; job: JobResponse | null }
  | { status: 'error'; message: string }

const LABELS: Record<string, string> = {
  skill_match: '技能匹配',
  experience_match: '经验匹配',
  education_match: '教育匹配',
  salary_match: '薪资匹配',
  location_match: '地理匹配',
  soft_skill_match: '软技能匹配',
}

const DIM_COLORS: Record<string, string> = {
  skill_match: 'bg-emerald-500',
  experience_match: 'bg-sky-500',
  education_match: 'bg-indigo-500',
  salary_match: 'bg-amber-500',
  location_match: 'bg-rose-500',
  soft_skill_match: 'bg-violet-500',
}

function ScoreBar({ label, score, colorKey }: { label: string; score: number; colorKey: string }) {
  const pct = Math.min(100, Math.max(0, score))
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-700 dark:text-slate-300">{label}</span>
        <span className="font-semibold text-slate-800 dark:text-slate-200">{pct}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-white/10">
        <div
          className={`h-2 rounded-full transition-all ${DIM_COLORS[colorKey] ?? 'bg-slate-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function TagList({ title, items, color = 'slate' }: { title: string; items: string[]; color?: 'slate' | 'emerald' | 'rose' | 'amber' }) {
  if (items.length === 0) return null
  const bg: Record<string, string> = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-200',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200',
  }
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      <ul className="flex flex-wrap gap-2">
        {items.map((t, i) => (
          <li
            key={`${t}-${i}`}
            className={`rounded-full px-3 py-1 text-xs ${bg[color] ?? bg.slate}`}
          >
            {t}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 上下文卡片 — 默认展开，让用户先看到"我们到底在评什么 JD" */
function JobDetailCard({ job, fallbackId }: { job: JobResponse | null; fallbackId: number }) {
  if (!job) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        ⚠️ 无法加载岗位 #{fallbackId}（已删除？）
      </div>
    )
  }
  return (
    <details
      className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      open
    >
      <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <span className="flex items-center gap-2">
          📋 岗位详情
          <span className="text-xs font-normal text-slate-400">
            #{job.id} · {job.position || '(未命名职位)'}{job.company ? ` @ ${job.company}` : ''}
          </span>
          <span className="ml-auto text-[10px] text-slate-400">点击折叠</span>
        </span>
      </summary>
      <div className="space-y-4 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          <Meta label="公司" value={job.company} />
          <Meta label="职位" value={job.position} />
          <Meta label="地点" value={job.location} />
          <Meta
            label="薪资"
            value={
              job.salary_min || job.salary_max
                ? `${job.salary_min ?? '?'}k - ${job.salary_max ?? '?'}k`
                : null
            }
          />
          {job.source_url && (
            <div className="sm:col-span-2">
              <dt className="text-slate-500 dark:text-slate-400">来源链接</dt>
              <dd className="break-all">
                <a
                  href={job.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-seeker-600 hover:underline"
                >
                  {job.source_url}
                </a>
              </dd>
            </div>
          )}
        </dl>
        <div>
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">岗位描述（raw_text）</p>
          <pre className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 dark:bg-slate-800 dark:text-slate-200">
            {job.raw_text || '(空)'}
          </pre>
        </div>
      </div>
    </details>
  )
}

/** 简历详情 — 默认折叠（简历正文通常较长） */
function ResumeDetailCard({ resume, fallbackId }: { resume: ResumeResponse | null; fallbackId: number }) {
  if (!resume) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        ⚠️ 无法加载简历 #{fallbackId}（已删除？）
      </div>
    )
  }
  const text = resume.raw_text ?? ''
  const structured = resume.structured_json
  return (
    <details className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <span className="flex items-center gap-2">
          📄 简历详情
          <span className="text-xs font-normal text-slate-400">
            #{resume.id} · {resume.filename} · {text.length} 字符
          </span>
          <span className="ml-auto text-[10px] text-slate-400">点击展开</span>
        </span>
      </summary>
      <div className="space-y-3 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
        <p className="text-[11px] text-slate-400">
          上传于 {formatDateTime(resume.created_at)}
          {' · '}存储路径 <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">{resume.storage_path}</code>
        </p>
        {structured && Object.keys(structured).length > 0 && (
          <details className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">
            <summary className="cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
              结构化字段（structured_json）
            </summary>
            <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap break-all text-[10px] text-slate-700 dark:text-slate-300">
              {JSON.stringify(structured, null, 2)}
            </pre>
          </details>
        )}
        <div>
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300">解析正文（raw_text）</p>
          <pre className="mt-1 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs leading-relaxed text-slate-800 dark:bg-slate-800 dark:text-slate-200">
            {text || '(空 — 解析未提取到文本)'}
          </pre>
        </div>
      </div>
    </details>
  )
}

function Meta({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div>
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-slate-800 dark:text-slate-200">{value === null || value === undefined || value === '' ? '—' : String(value)}</dd>
    </div>
  )
}

/**
 * SeekerResult — /seeker/result/:id
 *  - 展示单条 Analysis 详情（总分、维度评分、技能/风险/建议等）
 *  - 如果 LLM 报错（error 字段），前端用红色 banner 展示诊断信息
 *  - 提供"重新分析"按钮（POST 同一 resume+job，跳转新 id）
 */
export function SeekerResult() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [reanalyzing, setReanalyzing] = useState(false)
  const [generating, setGenerating] = useState(false)

  const load = async (aid: string) => {
    setState({ status: 'loading' })
    try {
      const analysis = await api.analysis.get(aid)
      const [resume, job] = await Promise.allSettled([
        api.resumes.get(analysis.resume_id),
        api.jobs.get(analysis.job_id),
      ])
      setState({
        status: 'ready',
        analysis,
        resume: resume.status === 'fulfilled' ? resume.value : null,
        job: job.status === 'fulfilled' ? job.value : null,
      })
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `HTTP ${err.status} 加载失败`
          : err instanceof Error
            ? err.message
            : 'unknown error'
      setState({ status: 'error', message: msg })
    }
  }

  useEffect(() => {
    if (!id) return
    queueMicrotask(() => load(id))
  }, [id])

  const reanalyze = async () => {
    if (state.status !== 'ready') return
    setReanalyzing(true)
    try {
      const next = await api.analysis.create(state.analysis.resume_id, state.analysis.job_id)
      navigate(`/seeker/result/${next.id}`)
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `HTTP ${err.status} · ${typeof err.body === 'string' ? err.body : JSON.stringify(err.body)}`
          : err instanceof Error
            ? err.message
            : 'unknown error'
      toast.error('重新分析失败：' + msg)
    } finally {
      setReanalyzing(false)
    }
  }

  const handleGenerate = async () => {
    if (state.status !== 'ready') return
    setGenerating(true)
    try {
      const res = await api.seekerPool.generate(state.analysis.job_id)
      toast.success('生成成功')
      navigate(`/seeker/resumes/${res.snapshot_id}`)
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `HTTP ${err.status} · ${typeof err.body === 'string' ? err.body : JSON.stringify(err.body)}`
          : err instanceof Error
            ? err.message
            : 'unknown error'
      toast.error('生成失败：' + msg)
    } finally {
      setGenerating(false)
    }
  }

  if (!id) {
    return (
      <section className="mx-auto max-w-3xl py-12 text-center text-slate-500">
        缺少分析 ID。<Link to="/seeker/pool" className="ml-2 text-seeker-600 hover:underline">去档案页生成投递版本</Link>
      </section>
    )
  }
  if (state.status === 'loading') {
    return (
      <section className="mx-auto max-w-3xl py-12 text-center text-slate-500">加载分析结果...</section>
    )
  }
  if (state.status === 'error') {
    return (
      <section className="mx-auto max-w-3xl py-12 text-center text-red-600">
        ❌ {state.message}
      </section>
    )
  }

  const { analysis, resume, job } = state
  const dims = (analysis.dimension_scores_json ?? {}) as Record<string, unknown>
  const meta = (analysis.model_config_json ?? {}) as Record<string, unknown>
  const error = meta?.error as string | undefined
  // §8.38: assessment 必须有 gate/core 至少一个字段才渲染卡片
  // 后端在 LLM 失败时历史上写过 {} 空对象（truthy 但解构后全是 undefined），会触发 AssessmentCard 崩溃
  const rawAssessment = meta.assessment as Partial<Assessment> | undefined
  const hasValidAssessment = !!(rawAssessment && (rawAssessment.gate || rawAssessment.core))
  // Phase 7c: 新 fit 评估数据包含 skills_fit 等 5 维度 float 0.0-1.0
  const isPhase7c = typeof dims.skills_fit === 'number'

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-seeker-600">求职者模式 · /seeker/result/{id}</p>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">基于档案的分析</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">分析结果 #{id}</h1>
        <p className="text-xs text-slate-500">
          岗位: {job?.position ?? `#${analysis.job_id}`} ·{' '}
          模型: {String(meta.model ?? '—')} @ T={String(meta.temperature ?? '—')} ·{' '}
          {formatDateTime(analysis.created_at)}
        </p>
      </header>

      {/* 错误 banner */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          <p className="font-semibold">⚠️ LLM 调用失败（已生成占位结果，分数=0）</p>
          <p className="mt-1 text-xs font-mono opacity-80">{error}</p>
          <p className="mt-1 text-xs">建议：检查 /settings 中 LLM Provider / Base URL / 模型名称配置；若使用 Ollama，先 ollama pull <code>{String(meta.model ?? 'model')}</code></p>
        </div>
      )}

      {/* Phase 4 — 上下文卡片：先看 JD/简历，再看分数 */}
      <JobDetailCard job={job} fallbackId={analysis.job_id} />
      <ResumeDetailCard resume={resume} fallbackId={analysis.resume_id} />

      {/* §8.38: 综合契合度评分已移除（用户反馈：核心匹配度与总分不一致，容易误导） */}

      {/* Phase 7c: 新 Fit Assessment（5 维度 + details）；旧数据走 AssessmentCard / ScoreBar 兼容 */}
      {isPhase7c ? (
        <ResultFitPanel dims={dims} meta={meta} />
      ) : hasValidAssessment ? (
        <AssessmentCard
          assessment={rawAssessment as Assessment}
          informationGaps={(meta.information_gaps as string[]) ?? []}
          actionItems={(meta.action_items as Array<ActionItem | LegacyActionItem>) ?? []}
          advantages={(meta.advantages as string[]) ?? []}
          riskFactors={(meta.risk_factors as string[]) ?? []}
        />
      ) : (
        /* 旧数据兼容：维度评分进度条 */
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">维度评分（旧版数据）</h2>
          <div className="space-y-3">
            {Object.entries(LABELS).map(([key, label]) => (
              <ScoreBar key={key} label={label} score={Number(dims[key] ?? 0)} colorKey={key} />
            ))}
          </div>
        </div>
      )}

      {/* §8.40：advantages / risk_factors 已折叠进 AssessmentCard 优势/不足栏；
          这里只保留 matched_skills / missing_skills（粒度不同：技能 tag vs 综合优劣句子） */}
      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <TagList title="✅ 匹配技能" items={(meta.matched_skills as string[]) ?? []} color="emerald" />
        <TagList title="❌ 缺失技能" items={(meta.missing_skills as string[]) ?? []} color="rose" />
      </div>

      {/* 优化建议 */}
      {Array.isArray(meta.optimization_suggestions) && meta.optimization_suggestions.length > 0 && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">📝 简历优化建议</h2>
          <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
            {(meta.optimization_suggestions as string[]).map((s, i) => (
              <li key={i} className="rounded-md bg-slate-50 p-3 dark:bg-slate-800">{s}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Issue #004: 段落级修改建议 */}
      {Array.isArray(analysis.paragraph_suggestions_json) && analysis.paragraph_suggestions_json.length > 0 && (
        <div className="space-y-4 rounded-xl border border-seeker-200 bg-seeker-50/40 p-6 shadow-sm dark:border-seeker-900/40 dark:bg-seeker-950/20">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-seeker-700 dark:text-seeker-300">✂️ 段落级修改建议</h2>
            <span className="text-[10px] text-slate-400">分析 #{analysis.id} · {formatDateTime(analysis.created_at)}</span>
          </div>
          <div className="space-y-3">
            {analysis.paragraph_suggestions_json.map((s, i) => (
              <div key={i} className="rounded-lg border border-seeker-100 bg-white p-4 dark:border-seeker-900/30 dark:bg-slate-900">
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] font-medium text-rose-600 dark:text-rose-400">🔴 原文</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300">{s.target_text}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400">💡 问题</p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{s.issue}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">🟢 建议写法</p>
                    <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">{s.rewritten}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Link
                    to={`/seeker/pool?analysis_id=${analysis.id}`}
                    className="inline-flex items-center rounded bg-seeker-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-seeker-700"
                  >
                    ✏️ 去档案页应用
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 操作区 */}
      <ResultActionBar
        analysis={analysis}
        reanalyzing={reanalyzing}
        generating={generating}
        onReanalyze={reanalyze}
        onGenerate={handleGenerate}
      />
    </section>
  )
}
