import type { ReactNode } from 'react'

/** §8.17 LLM 智能识别状态 — 父组件 SeekerJobs 持有，按钮组件只渲染 */
export type ExtractState =
  | { status: 'idle' }
  | { status: 'extracting' }
  | { status: 'success'; filled: number; model: string | null }
  | { status: 'error'; message: string }

interface Props {
  rawText: string
  state: ExtractState
  onClick: () => void
}

/**
 * §8.17 LLM 智能识别按钮 — 从 raw_text 自动填充其他字段。
 *
 * 抽出来的目的: 把 SeekerJobs.tsx 控制在 500 行红线下（含本组件后已 ~480 行）。
 * onClick 由父组件实现（要 setForm 写表单，状态留父组件持有）。
 *
 * 用法 (在 SeekerJobs.tsx):
 *   <JobExtractButton rawText={form.raw_text} state={extractState} onClick={onExtract} />
 */
export function JobExtractButton({ rawText, state, onClick }: Props): ReactNode {
  const tooShort = rawText.trim().length < 10
  const disabled = state.status === 'extracting' || tooShort

  return (
    <div className="flex flex-wrap items-center gap-3 -mt-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-lg border border-seeker-200 bg-seeker-50 px-3 py-1.5 text-xs font-medium text-seeker-700 transition-colors hover:bg-seeker-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-seeker-900 dark:bg-seeker-950/30 dark:text-seeker-300 dark:hover:bg-seeker-950/50"
      >
        🤖 {state.status === 'extracting' ? '识别中…' : '智能识别（自动填充公司/职位/薪资/地点）'}
      </button>
      {state.status === 'success' && (
        <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
          ✅ 已自动填充 {state.filled} 个字段
          {state.filled === 0 && '（LLM 未识别出任何关键字段，请人工填写）'}
          {state.model && <span className="ml-1 opacity-60">· {state.model}</span>}
        </span>
      )}
      {state.status === 'error' && (
        <span className="text-[11px] text-red-600 dark:text-red-400">
          ❌ {state.message}
        </span>
      )}
      {state.status === 'idle' && !tooShort && (
        <span className="text-[11px] text-slate-400">
          点上面按钮让 LLM 帮你提取关键字段（仅填空字段，不覆盖已填）
        </span>
      )}
    </div>
  )
}
