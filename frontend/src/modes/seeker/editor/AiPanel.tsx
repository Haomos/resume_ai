/**
 * AiPanel — Phase 5 §8.36 A14 + §8.43 删除 TipTap 依赖
 *
 * 结构化编辑器右侧的 AI 助手面板：
 * - 显示分析建议（assessment / matched/missing skills / action items）
 * - 一键应用 path-based patch（通过 onApplyLocalPatch 改本地 state，或
 *   通过 PATCH /structured 走服务端白名单校验）
 * - 跳转完整分析页（/seeker/analyze）
 *
 * §8.43: 移除 editor: Editor | null prop + polish 选段润色 + replaceBySearch
 * (target_text 路径)；free-form 编辑器已被删除，所有简历都走结构化 path。
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import type { JobResponse, AnalysisResult } from '../../../api/types'
import { api, ApiError } from '../../../api/client'
import { Tooltip } from '../../../shared/Tooltip'

export function AiPanel({
  resumeId,
  onPatchApplied,
  onApplyLocalPatch,
  onBeforeNavigate,
  jobs,
  jobId,
  onJobChange,
  analysisSuggestions: externalSuggestions,
  analysisId,
}: {
  resumeId?: string
  onPatchApplied?: () => void
  /** §8.38 Fix 2: 结构化编辑器下不走 API patch，直接前端 dispatch 改本地 state */
  onApplyLocalPatch?: (path: string, value: unknown) => void
  /** 跳转分析页前调用，触发即时保存避免 debounce 窗口内数据丢失 */
  onBeforeNavigate?: () => void
  jobs: JobResponse[]
  jobId: number | null
  onJobChange: (id: number) => void
  analysisSuggestions?: {
    assessment: Record<string, unknown> | null
    actionItems: Array<{
      priority: string
      path?: string
      target_text?: string
      issue: string
      rewritten?: string
      new_value?: unknown
    }>
    missingSkills: string[]
    matchedSkills: string[]
  } | null
  analysisId?: string
}) {
  const [_analysisResult] = useState<AnalysisResult | null>(null)

  let effectiveSuggestions = externalSuggestions ?? null
  if (!effectiveSuggestions && _analysisResult) {
    try {
      const mc = (_analysisResult as AnalysisResult).model_config_json ?? {}
      effectiveSuggestions = {
        assessment: (mc.assessment as Record<string, unknown> | null) ?? null,
        actionItems: Array.isArray(mc.action_items) ? (mc.action_items as Array<{ priority: string; path?: string; target_text?: string; issue: string; rewritten?: string; new_value?: unknown }>) : [],
        missingSkills: Array.isArray(mc.missing_skills) ? (mc.missing_skills as string[]) : [],
        matchedSkills: Array.isArray(mc.matched_skills) ? (mc.matched_skills as string[]) : [],
      }
    } catch (e) {
      console.error('[AiPanel] parse model_config_json failed:', e)
      effectiveSuggestions = null
    }
  }

  const handleError = (err: unknown) => {
    const msg = err instanceof ApiError ? `HTTP ${err.status}` : err instanceof Error ? err.message : 'unknown'
    toast.error('操作失败: ' + msg)
  }

  const handleAnalyze = () => {
    if (!resumeId || !jobId) { toast('请先选择目标岗位'); return }
    onBeforeNavigate?.()
    window.location.href = `/seeker/analyze?job_id=${jobId}`
  }

  /** Phase 5 §8.36 A5: 应用 path-based patch */
  const applyPatch = async (path: string, newValue: unknown) => {
    if (!resumeId) { toast.error('resumeId 缺失，无法应用 patch'); return }
    try {
      const resp = await api.resumes.patchStructured(resumeId, [{ path, new_value: newValue as string | string[] }])
      if (resp.rejected.length > 0) {
        toast.error('Patch 被服务端拒绝：' + resp.rejected[0].reason)
        return
      }
      onPatchApplied?.()
    } catch (err) { handleError(err) }
  }

  return (
    <aside className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">🤖 AI 简历助手</h2>
        <p className="text-[11px] text-slate-500">AI 建议直接应用到对应字段 · <Tooltip tip="点击'一键替换'即可用 AI 改写版覆盖原文；不满意可点'撤销'恢复"><span className="cursor-help underline decoration-dotted">怎么用？</span></Tooltip></p>
      </div>

      {/* ── 分析建议 ── */}
      {effectiveSuggestions && (
        <div className="space-y-3 rounded-lg border border-seeker-200 bg-seeker-50/40 p-3 dark:border-seeker-900/30 dark:bg-seeker-950/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-seeker-800 dark:text-seeker-300">📝 分析建议</p>
            {analysisId && (
              <Link
                to={`/seeker/result/${analysisId}`}
                className="text-[10px] text-seeker-600 hover:underline"
              >
                查看完整结果 →
              </Link>
            )}
          </div>
          {analysisId && (
            <p className="text-[10px] text-slate-500">已自动恢复该岗位的最新分析 #{analysisId}</p>
          )}

          {/* 总体评估 — §8.42 修复：旧版直接 String(verdict) 输出 "[object Object]"，
              因为 verdict 是 {action, gaps, concerns} 对象，需要取 .action 字段 */}
          {effectiveSuggestions.assessment && (() => {
            const verdictObj = effectiveSuggestions.assessment.verdict as { action?: string } | undefined
            const verdictAction = verdictObj?.action
            if (!verdictAction) return null
            return (
              <div className="space-y-1 rounded bg-white/60 p-2 dark:bg-black/20">
                <p className="text-[11px] font-medium text-seeker-700 dark:text-seeker-400">
                  总体评估：<VerdictLabel verdict={verdictAction} />
                </p>
              </div>
            )
          })()}

          {/* 已匹配技能 */}
          {effectiveSuggestions.matchedSkills.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">已匹配技能：</p>
              <div className="flex flex-wrap gap-1">
                {effectiveSuggestions.matchedSkills.map((s: string) => (
                  <span key={s} className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* 缺少技能 */}
          {effectiveSuggestions.missingSkills.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">缺少技能：</p>
              <div className="flex flex-wrap gap-1">
                {effectiveSuggestions.missingSkills.map((s: string) => (
                  <span key={s} className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* 改进建议 */}
          {effectiveSuggestions.actionItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-seeker-700 dark:text-seeker-400">改进建议：</p>
              {effectiveSuggestions.actionItems.map((item: { priority: string; path?: string; target_text?: string; issue: string; rewritten?: string; new_value?: unknown }, i: number) => (
                <div key={item.path ?? `action-${i}`} className="rounded bg-white/60 p-2 dark:bg-black/20">
                  <div className="flex items-center gap-1">
                    <span className={[
                      'rounded px-1 text-[10px] font-medium',
                      item.priority === 'high' ? 'bg-rose-100 text-rose-700' : item.priority === 'medium' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600',
                    ].join(' ')}>
                      {item.priority === 'high' ? '高' : item.priority === 'medium' ? '中' : '低'}
                    </span>
                    <span className="text-[11px] text-slate-700 dark:text-slate-300">{item.issue}</span>
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {item.path && (
                      <code className="text-[10px] text-slate-500">路径：{item.path}</code>
                    )}
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                      建议：{typeof item.new_value === 'string' ? item.new_value : typeof item.rewritten === 'string' ? item.rewritten : String(item.new_value ?? item.rewritten ?? '').slice(0, 60)}…
                    </p>
                  </div>
                  {item.path && (
                    <div className="mt-1 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const value = item.new_value ?? item.rewritten ?? ''
                          if (onApplyLocalPatch) {
                            // §8.38 Fix 2: 结构化编辑器直接改本地 state，即时反馈 + 避免 auto-save 覆盖冲突
                            onApplyLocalPatch(item.path!, value)
                          } else {
                            applyPatch(item.path!, value)
                          }
                        }}
                        className="text-[11px] font-medium text-seeker-700 hover:underline dark:text-seeker-300"
                      >
                        ✏️ 应用该 patch
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 空状态兜底 */}
          {effectiveSuggestions.matchedSkills.length === 0 &&
            effectiveSuggestions.missingSkills.length === 0 &&
            effectiveSuggestions.actionItems.length === 0 && (
            <p className="text-[11px] text-slate-500">✅ 评估完成：简历与岗位匹配度良好，暂无硬性改进建议。</p>
          )}
        </div>
      )}

      <hr className="border-slate-200 dark:border-slate-700" />

      <div className="space-y-1">
        <label className="text-[11px] font-medium text-slate-500">你想投的岗位</label>
        <select
          value={jobId ?? ''}
          onChange={(e) => onJobChange(Number(e.target.value))}
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-950"
        >
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>#{j.id} · {j.position ?? '(未命名)'}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleAnalyze}
          disabled={!jobId}
          className="mt-2 w-full rounded-lg bg-seeker-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-seeker-700 disabled:opacity-50"
        >
          {effectiveSuggestions ? '♻️ 重新分析' : '🔍 分析档案 vs 岗位'}
        </button>
      </div>

      <p className="text-[11px] text-slate-400">AI 结果由本地 Ollama / 配置 LLM 生成。</p>
    </aside>
  )
}

function VerdictLabel({ verdict }: { verdict: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    // §8.34+ 新 schema (verdict.action)
    strong_apply: { cls: 'text-emerald-600 font-semibold', label: '强烈建议投递' },
    apply: { cls: 'text-emerald-600', label: '建议投递' },
    gap_fill_first: { cls: 'text-amber-600', label: '先补缺口' },
    mismatch: { cls: 'text-rose-600', label: '不建议投递' },
    interview: { cls: 'text-emerald-600', label: '建议约面' },
    shortlist: { cls: 'text-sky-600', label: '放备胎池' },
    reject: { cls: 'text-rose-600', label: '淘汰' },
    uncertain: { cls: 'text-slate-500', label: '信息不足' },
    // 旧 schema 向后兼容（pre-§8.34 历史数据可能还有）
    strong_match: { cls: 'text-emerald-600', label: '强匹配' },
    match: { cls: 'text-emerald-600', label: '匹配' },
    partial: { cls: 'text-amber-600', label: '部分匹配' },
    weak: { cls: 'text-rose-600', label: '弱匹配' },
    fail: { cls: 'text-rose-600', label: '不匹配' },
  }
  const { cls, label } = map[verdict] || { cls: 'text-slate-600', label: verdict }
  return <span className={cls}>{label}</span>
}
