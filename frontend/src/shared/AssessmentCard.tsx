import type { Assessment, ActionItem, LegacyActionItem } from '../api/types'
import { isPathActionItem } from '../api/types'

interface AssessmentCardProps {
  assessment: Assessment | null | undefined
  informationGaps: string[]
  /** 双格式兼容：新数据是 ActionItem (path-based)，老数据是 LegacyActionItem (target_text)。 */
  actionItems: Array<ActionItem | LegacyActionItem>
  /** §8.40 简化：直接从 model_config_json 顶层取，由 AssessmentCard 内部归并到 优势/不足。 */
  advantages?: string[]
  riskFactors?: string[]
}

const GATE_LABELS: Record<string, string> = {
  must_skills: '核心技能',
  experience: '经验年限',
  hard_constraints: '硬性条件',
}

/** §8.40：Verdict 按结论着色（绿=正向 / 琥珀=有缺口 / 红=负向 / 灰=信息不足） */
const VERDICT_STYLE: Record<
  string,
  { container: string; emoji: string; label: string }
> = {
  // Seeker
  strong_apply: {
    container:
      'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
    emoji: '🚀',
    label: '强烈建议投递',
  },
  apply: {
    container:
      'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300',
    emoji: '✅',
    label: '建议投递',
  },
  gap_fill_first: {
    container:
      'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200',
    emoji: '🔧',
    label: '先补缺口再投',
  },
  mismatch: {
    container:
      'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200',
    emoji: '❌',
    label: '不建议投递',
  },
  // Recruiter
  interview: {
    container:
      'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
    emoji: '🎯',
    label: '建议约面',
  },
  shortlist: {
    container:
      'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-200',
    emoji: '📋',
    label: '放备胎池',
  },
  reject: {
    container:
      'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200',
    emoji: '🚫',
    label: '淘汰',
  },
  uncertain: {
    container:
      'border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    emoji: '❓',
    label: '信息不足',
  },
}

const PRIORITY_TEXT: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

const PRIORITY_STYLE: Record<string, string> = {
  high: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

/** 简易归一化去重：去空白后小写匹配前 12 字符 */
function dedupe(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items) {
    if (!raw) continue
    const trimmed = raw.trim()
    if (!trimmed) continue
    const key = trimmed.replace(/\s+/g, '').toLowerCase().slice(0, 12)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

export function AssessmentCard({
  assessment,
  informationGaps,
  actionItems,
  advantages,
  riskFactors,
}: AssessmentCardProps) {
  if (!assessment) return null

  const { gate, core, verdict } = assessment

  // §8.38: 防御 LLM 失败导致的不完整 assessment（gate/core/verdict 任一缺失则不渲染卡片）
  // 历史数据中存在 assessment={} 空对象的污染（详见 LOG §8.38），早退避免组件崩溃
  const missing: string[] = []
  if (!gate) missing.push('门槛')
  if (!core) missing.push('核心匹配')
  if (!verdict) missing.push('结论')
  if (missing.length > 0) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
        <p className="font-semibold">⚠️ 评估数据不完整</p>
        <p className="mt-1 text-xs">
          缺失字段：{missing.join(' / ')}（通常是 LLM 调用失败时落地的占位数据）。建议重新分析。
        </p>
      </div>
    )
  }

  // §8.40：归并 优势 / 不足（按数据来源优先级，去重后各取 3）
  const prosRaw: string[] = [
    ...(advantages ?? []),
    ...(core?.skill_depth === 'high' || core?.skill_depth === 'medium'
      ? core?.skill_evidence ?? []
      : []),
    ...(core?.experience_quality === 'high' || core?.experience_quality === 'medium'
      ? core?.experience_evidence ?? []
      : []),
  ]
  const pros = dedupe(prosRaw).slice(0, 3)

  const consRaw: string[] = []
  // Gate fails 是最硬的"不足"
  Object.entries(gate).forEach(([key, val]) => {
    if (val === 'fail') consRaw.push(`${GATE_LABELS[key] ?? key}未达标`)
  })
  consRaw.push(...(verdict.gaps ?? []))
  consRaw.push(...(verdict.concerns ?? []))
  consRaw.push(...(riskFactors ?? []))
  const cons = dedupe(consRaw).slice(0, 3)

  const verdictStyle = VERDICT_STYLE[verdict.action] ?? VERDICT_STYLE.uncertain

  return (
    <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {/* §8.40 — 1. Verdict 大标签（顶部，按结论着色，最显眼） */}
      <header
        className={`flex flex-col items-center gap-2 rounded-lg border-2 px-6 py-5 text-center ${verdictStyle.container}`}
      >
        <span className="text-4xl leading-none">{verdictStyle.emoji}</span>
        <h2 className="text-xl font-semibold tracking-tight">{verdictStyle.label}</h2>
        {core?.overall_rationale && (
          <p className="max-w-prose text-sm opacity-90">{core.overall_rationale}</p>
        )}
      </header>

      {/* §8.40 — 2. 优势 / 不足 双栏（数据归并自 advantages / evidence / gaps / concerns / risk_factors） */}
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <h3 className="mb-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            ✅ 你的优势
          </h3>
          {pros.length > 0 ? (
            <ul className="space-y-1.5">
              {pros.map((p, i) => (
                <li key={i} className="text-xs leading-relaxed text-emerald-900 dark:text-emerald-200">
                  • {p}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs italic text-emerald-700/60 dark:text-emerald-400/60">— 未识别到明显优势 —</p>
          )}
        </section>

        <section className="rounded-lg border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
          <h3 className="mb-2 text-sm font-semibold text-rose-800 dark:text-rose-300">⚠️ 不足之处</h3>
          {cons.length > 0 ? (
            <ul className="space-y-1.5">
              {cons.map((c, i) => (
                <li key={i} className="text-xs leading-relaxed text-rose-900 dark:text-rose-200">
                  • {c}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs italic text-rose-700/60 dark:text-rose-400/60">— 暂无明显缺口 —</p>
          )}
        </section>
      </div>

      {/* §8.40 — 3. 信息缺失提示（保留，但下沉到优劣下方） */}
      {informationGaps.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/30 dark:bg-amber-950/20">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            ⚠️ 信息缺失（以下维度无法评估）
          </p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{informationGaps.join(' · ')}</p>
        </div>
      )}

      {/* §8.40 — 4. 改进建议（action_items，保留原逻辑） */}
      {actionItems.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">🔧 改进建议</h3>
            <span className="text-[10px] text-amber-600 dark:text-amber-400">
              ⚠️ 应用前请核对建议中的数字/地点/公司名是否为你的真实信息
            </span>
          </div>
          <div className="space-y-2">
            {actionItems.map((item, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      PRIORITY_STYLE[item.priority] ?? 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {PRIORITY_TEXT[item.priority] ?? item.priority}
                  </span>
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{item.issue}</span>
                  {isPathActionItem(item) && (
                    <code className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {item.path}
                    </code>
                  )}
                </div>
                <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">
                  建议：
                  {item.rewritten ??
                    (() => {
                      const nv = isPathActionItem(item) ? item.new_value : undefined
                      return Array.isArray(nv) ? nv.join(' · ') : nv
                    })() ??
                    '—'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
