import { NavLink } from 'react-router-dom'
import { useMode } from '../hooks/useMode'
import { seekerNav, recruiterNav } from './navConfig'
import type { NavItem } from './navConfig'

function NavList({ items, accent }: { items: NavItem[]; accent: string }) {
  return (
    <ul className="space-y-1">
      {items.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.to.split('/').length <= 2}
            className={({ isActive }) =>
              [
                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? `bg-${accent}-500/15 font-semibold text-${accent}-400`
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
                item.todo ? 'opacity-60' : '',
              ].join(' ')
            }
          >
            <span aria-hidden className="w-5 text-center">{item.icon}</span>
            <span>{item.label}</span>
            {item.todo && (
              <span className="ml-auto rounded-full bg-white/10 px-1.5 text-[10px] uppercase tracking-wide text-slate-500">
                todo
              </span>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}

/**
 * NavSidebar — 左侧导航
 *  - 顶部：根据 mode 渲染 seeker / recruiter 各自菜单
 *  - 底部：跨模式共享的入口（设置等）
 */
export function NavSidebar() {
  const { mode } = useMode()
  const items = mode === 'seeker' ? seekerNav : recruiterNav
  const accent = mode === 'seeker' ? 'cyan' : 'amber'
  return (
    <nav className="flex h-full flex-col p-4">
      <NavList items={items} accent={accent} />
    </nav>
  )
}
