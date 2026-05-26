import { useMode } from '../hooks/useMode'
import type { Mode } from '../context/mode'

const LABELS: Record<Mode, string> = {
  seeker: '求职者',
  recruiter: '招聘者',
}

const ORDER: Mode[] = ['seeker', 'recruiter']

/**
 * ModeSwitcher — 顶栏胶囊状切换器
 *  - 求职者(seeker) 高亮主色: seeker-500 (海蓝)
 *  - 招聘者(recruiter) 高亮主色: recruiter-500 (琥珀)
 *  - 切换会触发 ModeContext.setMode → 持久化 + 路由跳转
 */
export function ModeSwitcher() {
  const { mode, setMode } = useMode()

  return (
    <div
      role="group"
      aria-label="选择使用模式"
      className="inline-flex rounded-full border border-white/10 bg-[#111827]/60 p-1"
    >
      {ORDER.map((m) => {
        const active = m === mode
        const palette =
          m === 'seeker'
            ? active
              ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/25'
              : 'text-slate-400 hover:bg-white/5 hover:text-cyan-400'
            : active
              ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
              : 'text-slate-400 hover:bg-white/5 hover:text-amber-400'
        return (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={active}
            className={`min-w-[80px] rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${palette}`}
          >
            {LABELS[m]}
          </button>
        )
      })}
    </div>
  )
}
