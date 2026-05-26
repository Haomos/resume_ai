import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface EmptyStateAction {
  label: string
  to?: string
  onClick?: () => void
  /** 'primary' = 实心按钮，'link' = 文字链接（默认 link，更克制） */
  variant?: 'primary' | 'link'
}

interface EmptyStateProps {
  /** 占位图标 — emoji 字符串或 lucide icon 都行 */
  icon?: ReactNode
  /** 主标题（必填） */
  title: string
  /** 描述文字 */
  description?: ReactNode
  /** 1-2 个引导操作 */
  actions?: EmptyStateAction[]
  /** 容器尺寸：'sm' 用于 inline 小区域，'md' 用于整页（默认 md） */
  size?: 'sm' | 'md'
}

/**
 * 通用空状态组件 — 列表/历史/分析数据为 0 时使用。
 *
 * §8.42 引入：之前每个页面各自写"暂无 XX"提示，样式散乱（有的 rounded-xl，
 * 有的 dashed border，有的没图标），统一收拢到这里。
 *
 * 设计原则：
 * - **不是 error** — 空状态是正常路径，配色克制（slate + dashed border）
 * - **必带引导** — 用户看到空白页应该知道下一步去哪
 * - **图标可选** — 装了 lucide-react 后传 icon 节点；否则传 emoji 字符串
 */
export function EmptyState({ icon, title, description, actions, size = 'md' }: EmptyStateProps) {
  const padding = size === 'sm' ? 'p-6' : 'p-10'
  const iconSize = size === 'sm' ? 'text-2xl' : 'text-4xl'

  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 text-center dark:border-slate-700 dark:bg-slate-900/30 ${padding}`}
    >
      {icon && <div className={`mb-3 ${iconSize} opacity-60`}>{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      {description && (
        <div className="mt-1.5 max-w-prose text-xs text-slate-500 dark:text-slate-400">
          {description}
        </div>
      )}
      {actions && actions.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {actions.map((a, i) => {
            const isPrimary = a.variant === 'primary'
            const cls = isPrimary
              ? 'inline-flex items-center gap-1 rounded-md bg-seeker-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-seeker-700'
              : 'inline-flex items-center gap-1 text-xs font-medium text-seeker-600 hover:underline dark:text-seeker-400'
            if (a.to) {
              return (
                <Link key={i} to={a.to} className={cls}>
                  {a.label} {!isPrimary && '→'}
                </Link>
              )
            }
            return (
              <button key={i} type="button" onClick={a.onClick} className={cls}>
                {a.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
