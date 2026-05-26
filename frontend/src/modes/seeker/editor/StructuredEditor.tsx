/**
 * StructuredEditor — Phase 5 §8.36 A13
 *
 * 分节卡片式编辑器（替代 TipTap free-form）。当 resume.schema_version 为
 * "json-resume-1.0.0+resumeai" 且 structured_json 含 basics 时，此组件接管
 * SeekerEditor 的渲染。
 *
 * 设计：
 * - 状态：useStructuredResume (useReducer + debounced PUT /structured)
 * - 编辑区：BasicSection / WorkSection / EducationSection / ProjectsSection / SkillsSection
 * - 右侧：AiPanel（尚未接入结构化建议面板，Phase 5 中继续改造）
 * - 导出：复用 PrintPreview（需要 renderer 把 JsonResume → HTML）
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import type { ResumeResponse, JobResponse } from '../../../api/types'
import { isJsonResumeFormat } from '../../../api/types'
import { api } from '../../../api/client'
import { useStructuredResume } from './_hooks/useStructuredResume'
import { BasicSection, WorkSection, EducationSection, ProjectsSection, CustomSection } from './sections'
import { AiPanel } from './AiPanel'
import { PrintPreview, resumeFileName } from './export'
import { GenerateSnapshotModal } from './GenerateSnapshotModal'

/** 为空白简历提供默认空模板（与 backend empty_json_resume 同构） */
function defaultEmptyResume(): NonNullable<ResumeResponse['structured_json']> {
  return {
    meta: { schema_version: 'json-resume-1.0.0+resumeai', canonical: 'https://jsonresume.org/schema/' },
    basics: {
      name: '', email: '', phone: '', url: '', summary: '',
      location: { city: '', region: '', countryCode: '' },
      profiles: [],
      desiredSalary: null, desiredLocation: null,
    },
    work: [], education: [], projects: [], skills: [], customSections: [],
    languages: [], certificates: [], awards: [],
    publications: [], interests: [], references: [], volunteer: [],
  }
}

export function StructuredEditor({
  resume,
  jobs,
  jobId,
  onJobChange,
  analysisSuggestions,
  analysisId,
  saveOverride,
  poolMode,
  snapshotMode,
}: {
  resume: ResumeResponse
  jobs: JobResponse[]
  jobId: number | null
  onJobChange: (id: number) => void
  /** §8.38 Fix 1: 从结果页带过来的分析建议 */
  analysisSuggestions?: {
    assessment: Record<string, unknown> | null
    actionItems: Array<{ priority: string; path?: string; target_text?: string; issue: string; rewritten?: string; new_value?: unknown }>
    missingSkills: string[]
    matchedSkills: string[]
  } | null
  /** Phase 7c: 分析建议来源 analysis_id，用于生成"查看完整结果"链接 */
  analysisId?: string
  /** Phase 7 §8.48: poolMode 下自定义保存函数（走 PUT /api/seeker/pool） */
  saveOverride?: (snapshot: import('../../../api/types').JsonResume) => Promise<unknown>
  /** Phase 7 §8.48: 是否显示档案生成入口 */
  poolMode?: boolean
  /** Phase 7 §8.48: 快照模式（限制只能改措辞，不能改事实） */
  snapshotMode?: boolean
}) {
  const initial = (isJsonResumeFormat(resume)
    ? resume.structured_json
    : defaultEmptyResume()) ?? defaultEmptyResume()

  const { resume: state, dispatch, status, saveNow } = useStructuredResume(
    String(resume.id),
    initial as unknown as import('../../../api/types').JsonResume,
    saveOverride,
  )

  const [showPreview, setShowPreview] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [lastGenerated, setLastGenerated] = useState<{ snapshot: ResumeResponse; strategy: unknown } | null>(null)
  const [deleting, setDeleting] = useState(false)
  const navigate = useNavigate()

  const handleDelete = async () => {
    if (!window.confirm('确定删除这份简历吗？此操作不可恢复。')) return
    setDeleting(true)
    try {
      await api.resumes.delete(resume.id)
      toast.success('简历已删除')
      const isRecruiter = window.location.pathname.startsWith('/recruiter')
      navigate(isRecruiter ? '/recruiter/pool' : snapshotMode ? '/seeker/resumes' : '/seeker/resumes')
    } catch (err) {
      toast.error('删除失败：' + (err instanceof Error ? err.message : 'unknown'))
    } finally {
      setDeleting(false)
    }
  }

  const [previewData, setPreviewData] = useState<{
    strategy: { overall_score?: number; selected_entries?: string[]; omitted_entries?: string[]; requirements?: Record<string, unknown> }
    selected: unknown[]
    omitted: unknown[]
  } | null>(null)

  const s = state as unknown as Record<string, unknown>

  const defaultOrder = ['basics', 'work', 'education', 'projects', 'customSections']
  const rawOrder = (state.meta?.section_order as string[]) ?? defaultOrder
  // 向后兼容：当新 section（如 customSections）被加入 defaultOrder 但旧简历的
  // section_order 里没有时，自动追加到末尾，避免用户看不到新增功能。
  const sectionOrder = Array.from(new Set([...rawOrder, ...defaultOrder]))

  const actionItems = analysisSuggestions?.actionItems ?? []

  // Phase 7 §8.48: snapshotMode guards — prevent mutating factual fields
  const readonlyPatterns = [
    /^basics\.name$/, /^basics\.email$/, /^basics\.phone$/,
    /^work\[\d+\]\.name$/, /^work\[\d+\]\.position$/, /^work\[\d+\]\.startDate$/, /^work\[\d+\]\.endDate$/,
    /^projects\[\d+\]\.name$/, /^projects\[\d+\]\.startDate$/, /^projects\[\d+\]\.endDate$/,
    /^education\[\d+\]\.institution$/, /^education\[\d+\]\.studyType$/, /^education\[\d+\]\.startDate$/, /^education\[\d+\]\.endDate$/,
  ]
  const guardedDispatch: typeof dispatch = snapshotMode
    ? (action) => {
        if (action.type === 'SET_FIELD') {
          if (readonlyPatterns.some((p) => p.test(action.path))) {
            toast('⚠️ 快照模式：不能修改事实字段（公司名、职位、日期等）')
            return
          }
        }
        if (action.type === 'ADD_ITEM' || action.type === 'REMOVE_ITEM' || action.type === 'REORDER_SECTION') {
          toast('⚠️ 快照模式：不能增删或重排条目')
          return
        }
        dispatch(action)
      }
    : dispatch

  const onApplySuggestion = (path: string, value: unknown) => guardedDispatch({ type: 'SET_FIELD', path, value })

  const sectionMap: Record<string, { label: string; component: React.ReactNode }> = {
    basics: { label: '👤 基本信息', component: <BasicSection basics={s.basics as import('../../../api/types').ResumeBasics} dispatch={guardedDispatch} suggestions={actionItems} onApplySuggestion={onApplySuggestion} /> },
    work: { label: '💼 工作经历', component: <WorkSection items={(s.work ?? []) as import('../../../api/types').ResumeWork[]} dispatch={guardedDispatch} suggestions={actionItems} onApplySuggestion={onApplySuggestion} /> },
    education: { label: '🎓 教育经历', component: <EducationSection items={(s.education ?? []) as import('../../../api/types').ResumeEducation[]} dispatch={guardedDispatch} suggestions={actionItems} onApplySuggestion={onApplySuggestion} /> },
    projects: { label: '🚀 项目经历', component: <ProjectsSection items={(s.projects ?? []) as import('../../../api/types').ResumeProject[]} dispatch={guardedDispatch} suggestions={actionItems} onApplySuggestion={onApplySuggestion} /> },
    customSections: { label: '📎 自定义区块', component: <CustomSection items={(s.customSections ?? []) as import('../../../api/types').ResumeCustomSection[]} dispatch={guardedDispatch} /> },
  }

  const moveSection = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir
    if (newIdx < 0 || newIdx >= sectionOrder.length) return
    dispatch({ type: 'REORDER_SECTION', oldIndex: idx, newIndex: newIdx })
  }

  return (
    <section className="mx-auto max-w-6xl space-y-4">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-cyan-400">
            求职者模式 · {poolMode ? '/seeker/pool' : snapshotMode ? `/seeker/resumes/${resume.id}` : `/seeker/editor/${resume.id}`} · {poolMode ? '档案编辑' : snapshotMode ? '投递版本编辑' : '结构化编辑'}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-50">
            {poolMode ? '📁 我的档案' : snapshotMode ? '📄 投递版本编辑' : '✏️ 简历编辑器'}
          </h1>
          <p className="text-xs text-slate-500">{resume ? `编辑：${resume.filename}` : '加载中…'}</p>
          {snapshotMode && (
            <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              ⚠️ <b>快照模式</b>：只能修改措辞（summary / highlights / description），
              <b>不能修改</b>公司名、职位、日期等事实字段。
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {poolMode && (
            <Link
              to="/seeker/pool/import"
              className="rounded-lg border border-white/10 bg-[#111827]/60 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-cyan-500/40 hover:bg-[#111827]/80 hover:text-cyan-400"
            >
              📤 导入经历
            </Link>
          )}
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="rounded-lg border border-white/10 bg-[#111827]/60 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-cyan-500/40 hover:bg-[#111827]/80 hover:text-cyan-400"
          >
            👁️ 预览
          </button>
          <button
            type="button"
            onClick={saveNow}
            disabled={status === 'saving'}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-cyan-500/20 transition-colors hover:bg-cyan-500 disabled:opacity-60"
          >
            {status === 'saving' ? '保存中…' : status === 'saved' ? '✅ 已保存' : '保存'}
          </button>
          {!poolMode && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 shadow-sm transition-colors hover:bg-red-100 disabled:opacity-60 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
            >
              {deleting ? '删除中…' : '🗑️ 删除'}
            </button>
          )}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          {sectionOrder.map((key, i) => {
            const sec = sectionMap[key]
            if (!sec) return null
            return (
              <div key={key} className="relative">
                <div className="absolute -left-8 top-0 hidden flex-col gap-1 lg:flex">
                  <button
                    type="button"
                    onClick={() => moveSection(i, -1)}
                    disabled={i === 0}
                    className="rounded border border-white/10 bg-[#111827]/60 px-1 py-0.5 text-[10px] text-slate-400 hover:bg-[#111827]/80 hover:text-cyan-400 disabled:opacity-30"
                    title="上移"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(i, 1)}
                    disabled={i === sectionOrder.length - 1}
                    className="rounded border border-white/10 bg-[#111827]/60 px-1 py-0.5 text-[10px] text-slate-400 hover:bg-[#111827]/80 hover:text-cyan-400 disabled:opacity-30"
                    title="下移"
                  >
                    ↓
                  </button>
                </div>
                {sec.component}
              </div>
            )
          })}
        </div>

        <AiPanel
          resumeId={String(resume.id)}
          jobs={jobs}
          jobId={jobId}
          onJobChange={onJobChange}
          analysisSuggestions={analysisSuggestions}
          analysisId={analysisId}
          onApplyLocalPatch={(path, value) => dispatch({ type: 'SET_FIELD', path, value })}
          onBeforeNavigate={saveNow}
        />
      </div>

      {showPreview && (
        <PrintPreview
          resume={state as unknown as import('../../../api/types').JsonResume}
          resumeId={resume.id}
          filename={resumeFileName(resume?.filename?.replace(/\.[^/.]+$/, '') ?? 'resume')}
          onClose={() => setShowPreview(false)}
          lineHeight={String(resume.line_height ?? 1.7)}
        />
      )}

      {showGenerateModal && (
        <GenerateSnapshotModal
          masterData={state as unknown as import('../../../api/types').JsonResume}
          snapshot={lastGenerated?.snapshot}
          strategy={(lastGenerated?.strategy ?? previewData?.strategy) as { overall_score?: number; selected_entries?: string[]; omitted_entries?: string[]; requirements?: Record<string, unknown> }}
          selectedEntries={previewData?.selected}
          omittedEntries={previewData?.omitted}
          onClose={() => {
            setShowGenerateModal(false)
            setPreviewData(null)
          }}
          onConfirmGenerate={async (selectedIds, polish) => {
            if (!jobId) return
            setGenerating(true)
            try {
              await saveNow()
              const res = await api.seekerPool.generate(jobId, selectedIds, polish)
              toast.success(`已生成投递版本 #${res.snapshot_id}`)
              setPreviewData(null)
              setLastGenerated({ snapshot: res.resume as ResumeResponse, strategy: res.strategy })
            } catch (err) {
              toast.error('生成失败: ' + (err instanceof Error ? err.message : 'unknown'))
            } finally {
              setGenerating(false)
            }
          }}
          onRegenerate={async () => {
            setShowGenerateModal(false)
            setPreviewData(null)
            setLastGenerated(null)
            if (!jobId) return
            setGenerating(true)
            try {
              await saveNow()
              const res = await api.seekerPool.generate(jobId)
              setLastGenerated({ snapshot: res.resume as ResumeResponse, strategy: res.strategy })
              setShowGenerateModal(true)
            } catch (err) {
              toast.error('重新生成失败: ' + (err instanceof Error ? err.message : 'unknown'))
            } finally {
              setGenerating(false)
            }
          }}
          onCloseAfterVeto={() => {
            setShowGenerateModal(false)
            setPreviewData(null)
          }}
        />
      )}

      {/* Phase 7 §8.48: 档案页面生成入口 — 两步：预览方案 → 确认生成 */}
      {poolMode && (
        <div className="sticky bottom-4 z-10 mx-auto mt-8 max-w-3xl">
          <div className="flex items-center gap-3 rounded-xl border border-seeker-200 bg-white p-4 shadow-lg dark:border-seeker-800 dark:bg-slate-900">
            <span className="text-sm text-slate-600 dark:text-slate-300">✨ 基于当前档案生成投递简历</span>
            <select
              className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              value={jobId ?? ''}
              onChange={(e) => onJobChange(Number(e.target.value))}
            >
              <option value="">选择目标岗位…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.company ? `${j.company} · ` : ''}{j.position}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!jobId || generating}
              onClick={async () => {
                if (!jobId) return
                setGenerating(true)
                try {
                  await saveNow()
                  const preview = await api.seekerPool.previewGenerate(jobId)
                  setPreviewData({
                    strategy: preview.strategy as { overall_score?: number; selected_entries?: string[]; omitted_entries?: string[]; requirements?: Record<string, unknown> },
                    selected: preview.selected,
                    omitted: preview.omitted,
                  })
                  setLastGenerated(null)
                  setShowGenerateModal(true)
                } catch (err) {
                  toast.error('预览生成方案失败: ' + (err instanceof Error ? err.message : 'unknown'))
                } finally {
                  setGenerating(false)
                }
              }}
              className="rounded-lg bg-seeker-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-seeker-700 disabled:opacity-50"
            >
              {generating ? '分析中…' : '预览生成方案'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
