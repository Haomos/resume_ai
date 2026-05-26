import { useState } from 'react'
import { createPortal } from 'react-dom'
import toast from 'react-hot-toast'
import { api } from '../../../api/client'
import type { ResumeResponse, JsonResume } from '../../../api/types'
import { PreviewContent } from './PreviewContent'
import { ResultOverview } from './ResultOverview'
import { DiffView } from './DiffView'
import { ReportView } from './ReportView'
import { PreviewFooter } from './PreviewFooter'
import { ResultFooter } from './ResultFooter'
interface GenerateSnapshotModalProps {
  masterData: JsonResume
  snapshot?: ResumeResponse
  strategy: {
    overall_score?: number
    selected_entries?: string[]
    omitted_entries?: string[]
    requirements?: Record<string, unknown>
    entry_scores?: Record<string, number>
    low_match_warning?: boolean
    strategy_notes?: string[]
    coverage?: { matched: string[]; gaps: string[] }
    fit?: {
      skills_fit: number
      experience_depth: number
      domain_fit: number
      entry_relevance: number
      hard_constraints: number
      weighted_score: number
      details?: Record<string, string>
    }
    veto?: boolean
    veto_reasons?: string[]
    enrichment_suggestions?: string[]
    report?: {
      assessment?: {
        verdict?: { action?: string }
        gate?: { pass?: boolean; reasons?: string[] }
        core?: { matched_skills?: string[]; missing_skills?: string[]; gaps?: string[] }
      }
      matched_skills?: string[]
      missing_skills?: string[]
      action_items?: Array<{ priority: string; issue: string; rewritten?: string }>
      fit?: Record<string, unknown>
      selected_count?: number
      omitted_count?: number
    }
  }
  selectedEntries?: unknown[]
  omittedEntries?: unknown[]
  onClose: () => void
  onConfirmGenerate?: (selectedIds: string[], polish: boolean) => void
  onRegenerate?: () => void
  onCloseAfterVeto?: () => void
}

export function GenerateSnapshotModal({
  masterData,
  snapshot,
  strategy,
  selectedEntries = [],
  omittedEntries = [],
  onClose,
  onConfirmGenerate,
  onRegenerate,
  onCloseAfterVeto,
}: GenerateSnapshotModalProps) {
  const isPreview = !snapshot
  const [activeTab, setActiveTab] = useState<'overview' | 'diff' | 'report'>('overview')
  const [confirmedIds, setConfirmedIds] = useState<string[]>(strategy.selected_entries ?? [])
  const [confirming, setConfirming] = useState(false)
  const [polish, setPolish] = useState(false)
  const [showVetoOverride, setShowVetoOverride] = useState(false)

  const score = strategy.overall_score ?? 0
  const snapshotData = snapshot?.structured_json as unknown as JsonResume
  const veto = strategy.veto ?? false
  const vetoReasons = strategy.veto_reasons ?? []
  const enrichment = strategy.enrichment_suggestions ?? []
  const fit = strategy.fit

  const toggleId = (id: string) => {
    setConfirmedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const handleConfirm = async () => {
    if (!onConfirmGenerate) return
    setConfirming(true)
    try {
      await onConfirmGenerate(confirmedIds, polish)
    } finally {
      setConfirming(false)
    }
  }

  const handleDiscard = async () => {
    if (!snapshot) return
    try {
      await api.resumes.delete(snapshot.id)
      toast.success('已放弃此版本')
      onClose()
    } catch (err) {
      toast.error('删除失败: ' + (err instanceof Error ? err.message : 'unknown'))
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
              {isPreview ? '✨ AI 生成方案预览' : '✨ AI 生成投递版本'}
            </h2>
            <p className="text-xs text-slate-500">
              匹配度 <span className="font-medium text-seeker-600">{Math.round(score * 100)}%</span>
              {' · '}
              {isPreview
                ? `已确认 ${confirmedIds.length} 条经历`
                : `已选 ${(strategy.selected_entries ?? []).length} 条经历`}
              {(strategy.omitted_entries ?? []).length > 0 && ` · 省略 ${(strategy.omitted_entries ?? []).length} 条`}
            </p>
          </div>
          <div className="flex gap-2">
            {!isPreview && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                重新生成
              </button>
            )}
            {!isPreview && (
              <button
                onClick={handleDiscard}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900 dark:bg-slate-800 dark:text-red-400"
              >
                🗑️ 放弃
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg bg-seeker-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-seeker-700"
            >
              {isPreview ? '取消' : '去编辑快照'}
            </button>
          </div>
        </header>

        {/* Preview mode: no tabs; Result mode: tabs */}
        {!isPreview && (
          <div className="flex border-b border-slate-100 px-6 dark:border-slate-800">
            {(['overview', 'diff', 'report'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'text-seeker-600 dark:text-seeker-400'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab === 'overview' ? '📊 评估概览' : tab === 'diff' ? '✏️ 改动对比' : '📋 生成报告'}
                {activeTab === tab && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-seeker-600 dark:bg-seeker-400" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="space-y-6 p-6">
          {isPreview ? (
            <PreviewContent
              fit={fit}
              veto={veto}
              vetoReasons={vetoReasons}
              enrichment={enrichment}
              strategy={{
                report: strategy.report,
                requirements: strategy.requirements,
                entry_scores: strategy.entry_scores,
                low_match_warning: strategy.low_match_warning,
                strategy_notes: strategy.strategy_notes,
                coverage: strategy.coverage,
              }}
              selectedEntries={selectedEntries}
              omittedEntries={omittedEntries}
              confirmedIds={confirmedIds}
              showVetoOverride={showVetoOverride}
              onToggleId={toggleId}
              onCloseAfterVeto={onCloseAfterVeto}
              onToggleVetoOverride={() => setShowVetoOverride(!showVetoOverride)}
            />
          ) : (
            <>
              {activeTab === 'overview' && (
                <ResultOverview strategy={strategy} masterData={masterData} />
              )}
              {activeTab === 'diff' && (
                <DiffView masterData={masterData} snapshotData={snapshotData} />
              )}
              {activeTab === 'report' && (
                <ReportView report={strategy.report} />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-6 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          {isPreview ? (
            <PreviewFooter
              veto={veto}
              polish={polish}
              onTogglePolish={setPolish}
              onConfirm={handleConfirm}
              confirming={confirming}
              confirmedCount={confirmedIds.length}
            />
          ) : (
            <ResultFooter snapshot={snapshot} snapshotData={snapshotData} onClose={onClose} />
          )}
        </footer>
      </div>
    </div>,
    document.body
  )
}
