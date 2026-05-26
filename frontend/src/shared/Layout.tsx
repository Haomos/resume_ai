import { Link, Outlet, useLocation } from 'react-router-dom'
import { ModeSwitcher } from './ModeSwitcher'
import { NavSidebar } from './NavSidebar'
import { useMode } from '../hooks/useMode'
import { useAuth } from '../context/AuthContext'

/**
 * Layout — Header(品牌+ModeSwitcher) + 左侧 Sidebar + 主内容区(Outlet) + Footer
 * 深色科技风（与 LandingPage 统一）
 */
export function Layout() {
  const { mode } = useMode()
  const { pathname } = useLocation()
  const { user, logout } = useAuth()
  const dotClass = mode === 'seeker' ? 'bg-cyan-400' : 'bg-amber-400'
  const isSettings = pathname === '/settings'

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-white/10 bg-[#0a0e1a]/90 px-6 py-3 backdrop-blur-xl">
        <Link to={`/${mode}/home`} className="flex items-center gap-2">
          <span className={`inline-block h-3 w-3 rounded-full ${dotClass}`} aria-hidden />
          <span className="bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-lg font-semibold tracking-wide text-transparent">
            ResumeAI
          </span>
        </Link>
        <div className="flex items-center gap-3">
          {user && (
            <span className="hidden text-xs text-slate-500 sm:inline">
              {user.email}
            </span>
          )}
          <Link
            to="/settings"
            className={[
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
              isSettings
                ? 'bg-white/10 font-semibold text-slate-100'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
            ].join(' ')}
          >
            <span aria-hidden>⚙️</span>
            <span>设置</span>
          </Link>
          <ModeSwitcher />
          {user && (
            <button
              onClick={logout}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-red-400"
              title="退出登录"
            >
              退出
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-56 shrink-0 border-r border-white/10 bg-[#111827]/40 sm:block">
          <NavSidebar />
        </aside>
        <main className="flex-1 px-6 py-8">
          <div key={pathname} className="animate-fadeSlide">
            <Outlet />
          </div>
        </main>
      </div>

      <footer className="border-t border-white/10 px-6 py-3 text-xs text-slate-500">
        本地部署 · 隐私优先 · 当前模式: {mode === 'seeker' ? '求职者' : '招聘者'}
      </footer>
    </div>
  )
}
