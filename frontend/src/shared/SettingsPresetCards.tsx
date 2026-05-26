import type { LLMPreset, CustomPreset } from '../api/types'

/**
 * Settings 页用的预设卡片 + 自定义卡片.
 * 抽到独立文件以将 Settings.tsx 控制在 500 行红线下.
 *
 * §8.13.2: CustomCard 由纯展示 ``<div>`` 改为 ``<button>``，让"自定义"
 * 卡片真正可点。之前用户点不动是因为它根本没接 ``onClick`` —— 只是当作
 * 状态指示器渲染（``isActive`` 为 true 时高亮），交互能力为零。现在
 * 点击会清空当前 form，让用户从一个 baseline 开始手填 base_url / model。
 */

export function PresetCard({
  preset,
  isActive,
  onClick,
}: {
  preset: LLMPreset
  isActive: boolean
  onClick: () => void
}) {
  const cls = isActive
    ? 'rounded-lg border p-3 text-left transition-colors border-emerald-400 bg-emerald-50 ring-2 ring-emerald-200 dark:border-emerald-700 dark:bg-emerald-950/40 dark:ring-emerald-900/40'
    : 'rounded-lg border p-3 text-left transition-colors border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600'
  return (
    <button type="button" onClick={onClick} className={cls}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {preset.label}
        </span>
        {isActive && (
          <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
            ✓ 当前
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        {preset.requires_api_key ? '🔑 需 API Key' : '🆓 无需 Key'} · {preset.models.length} 个模型
      </p>
    </button>
  )
}

export function CustomCard({
  isActive,
  onClick,
}: {
  isActive: boolean
  onClick: () => void
}) {
  const cls = isActive
    ? 'rounded-lg border border-dashed p-3 text-left transition-colors border-amber-400 bg-amber-50 ring-2 ring-amber-200 dark:border-amber-700 dark:bg-amber-950/30 dark:ring-amber-900/40'
    : 'rounded-lg border border-dashed p-3 text-left transition-colors border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-slate-600'
  return (
    <button type="button" onClick={onClick} className={cls}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">自定义</span>
        {isActive && (
          <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
            ✓ 当前
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        手填 base_url / 自托管 / 其他 OpenAI 兼容端点
      </p>
    </button>
  )
}

/** 用户已保存的自定义预设卡片（可点击加载、可删除） */
export function CustomPresetCard({
  preset,
  isActive,
  onClick,
  onDelete,
}: {
  preset: CustomPreset
  isActive: boolean
  onClick: () => void
  onDelete: () => void
}) {
  const cls = isActive
    ? 'relative rounded-lg border p-3 text-left transition-colors border-amber-400 bg-amber-50 ring-2 ring-amber-200 dark:border-amber-700 dark:bg-amber-950/30 dark:ring-amber-900/40'
    : 'relative rounded-lg border p-3 text-left transition-colors border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600'
  return (
    <button type="button" onClick={onClick} className={cls}>
      <span
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-slate-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/40 dark:hover:text-red-300"
        title="删除此自定义配置"
      >
        ×
      </span>
      <div className="flex items-center justify-between gap-2 pr-4">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {preset.name}
        </span>
        {isActive && (
          <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
            ✓ 当前
          </span>
        )}
      </div>
      <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        {preset.provider_type === 'ollama' ? 'Ollama' : preset.provider_type === 'anthropic' ? 'Anthropic' : 'OpenAI 兼容'} · {preset.model_name}
      </p>
    </button>
  )
}

/** 「+ 新建自定义」按钮 */
export function NewCustomCard({
  disabled,
  onClick,
}: {
  disabled: boolean
  onClick: () => void
}) {
  const cls = disabled
    ? 'cursor-not-allowed rounded-lg border border-dashed p-3 text-left opacity-50 border-slate-300 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-900/40'
    : 'rounded-lg border border-dashed p-3 text-left transition-colors border-slate-300 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/40 dark:hover:border-slate-600'
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls} title={disabled ? '最多保存 3 个自定义配置' : '创建新的自定义配置'}>
      <div className="flex items-center justify-center gap-1 py-1">
        <span className="text-lg text-slate-500 dark:text-slate-400">+</span>
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">新建自定义</span>
      </div>
    </button>
  )
}
