/**
 * SeekerEditor — §8.43 后 thin dispatcher
 *
 * 加载简历 + jobs + (可选)分析建议 → 渲染 StructuredEditor。
 * 旧 TipTap free-form 路径（含 Toolbar / Image 扩展 / autoSave HTML）已随
 * System B 整体移除。所有简历都走 JSON Resume schema；upload.py 兜底保证
 * schema_version 始终被设置，即便 PDF 解析失败也会用 empty_json_resume() +
 * raw_text → basics.summary 让用户在结构化编辑器里手动整理。
 */

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '../../../api/client'
import type { ResumeResponse, JobResponse } from '../../../api/types'
import { StructuredEditor } from './StructuredEditor'
import { ResumeSelector } from './ResumeSelector'
import { SkeletonPage } from '../../../shared/Skeleton'

export { ResumeSelector }

export function SeekerEditor({ poolMode, snapshotMode }: { poolMode?: boolean; snapshotMode?: boolean } = {}) {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const [resume, setResume] = useState<ResumeResponse | null>(null)
  const [jobs, setJobs] = useState<JobResponse[]>([])
  const [jobId, setJobId] = useState<number | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false
    const urlJobId = searchParams.get('job_id')
    if (poolMode) {
      // Phase 7: load master pool directly
      Promise.all([api.seekerPool.get(), api.jobs.list()])
        .then(([r, j]) => {
          if (cancelled) return
          setResume(r)
          setJobs(j)
          const preselect = urlJobId ? Number(urlJobId) : j[0]?.id ?? null
          if (preselect) setJobId(preselect)
        })
        .catch((err) => {
          if (cancelled) return
          setLoadError(err instanceof Error ? err.message : 'error')
        })
    } else {
      if (!id) return
      Promise.all([api.resumes.get(id), api.jobs.list()])
        .then(([r, j]) => {
          if (cancelled) return
          setResume(r)
          setJobs(j)
          const preselect = urlJobId ? Number(urlJobId) : j[0]?.id ?? null
          if (preselect) setJobId(preselect)
        })
        .catch((err) => {
          if (cancelled) return
          setLoadError(err instanceof Error ? err.message : 'error')
        })
    }
    return () => { cancelled = true }
  }, [id, poolMode, searchParams])

  // §8.34 + §8.36: 从结果页 analysis_id 加载分析建议传给 StructuredEditor → AiPanel
  // 注意：不自动恢复无 analysis_id 的历史分析，避免档案已改但建议过时的误导
  const [analysisSuggestions, setAnalysisSuggestions] = useState<{
    assessment: Record<string, unknown> | null
    actionItems: Array<{ priority: string; path?: string; issue: string; rewritten?: string }>
    missingSkills: string[]
    matchedSkills: string[]
  } | null>(null)
  const [analysisId, setAnalysisId] = useState<string | null>(null)

  useEffect(() => {
    const urlAnalysisId = searchParams.get('analysis_id')

    const loadById = async (id: string, signal?: AbortSignal) => {
      const data = await api.analysis.get(id)
      if (signal?.aborted) return
      const meta = (data.model_config_json ?? {}) as Record<string, unknown>
      const assessment = meta.assessment as Record<string, unknown> | undefined
      const actionItems = (meta.action_items ?? []) as Array<{ priority: string; path?: string; issue: string; rewritten?: string }>
      const missingSkills = (meta.missing_skills ?? []) as string[]
      const matchedSkills = (meta.matched_skills ?? []) as string[]
      if (assessment || actionItems.length > 0) {
        setAnalysisSuggestions({ assessment: assessment ?? null, actionItems, missingSkills, matchedSkills })
        setAnalysisId(id)
      }
    }

    if (urlAnalysisId) {
      const ctrl = new AbortController()
      loadById(urlAnalysisId, ctrl.signal).catch((err) => {
        console.warn('[SeekerEditor] load analysis suggestions failed:', err)
      })
      return () => { ctrl.abort() }
    }
  }, [searchParams])

  if (!id && !poolMode) {
    const isRecruiter = window.location.pathname.startsWith('/recruiter')
    return (
      <ResumeSelector
        recordType={isRecruiter ? 'candidate' : 'legacy'}
        onSelect={(resumeId) => { window.location.href = isRecruiter ? `/recruiter/editor/${resumeId}` : `/seeker/editor/${resumeId}` }}
      />
    )
  }

  if (loadError) {
    return (
      <section className="mx-auto max-w-5xl py-12 text-center text-red-600">
        ❌ 加载简历失败：{loadError}
      </section>
    )
  }

  if (!resume) {
    return <SkeletonPage />
  }

  return (
    <StructuredEditor
      resume={resume}
      jobs={jobs}
      jobId={jobId}
      onJobChange={setJobId}
      analysisSuggestions={analysisSuggestions}
      analysisId={analysisId ?? undefined}
      saveOverride={poolMode ? (s) => api.seekerPool.update(s) : undefined}
      poolMode={poolMode}
      snapshotMode={snapshotMode}
    />
  )
}
