import { Link } from 'react-router-dom'
import {
  Target,
  FolderKanban,
  Upload,
  ClipboardList,
  Zap,
  Trophy,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react'
import { useMode } from '../../hooks/useMode'

interface HomeCard {
  to: string
  icon: LucideIcon
  title: string
  desc: string
}

const CARDS: HomeCard[] = [
  { to: '/recruiter/jobs',        icon: Target,         title: 'JD 录入',     desc: '粘贴 JD 文本，或粘贴链接一键抓取(Scrapling)' },
  { to: '/recruiter/jobs/manage', icon: FolderKanban,   title: '岗位管理',   desc: '查看、编辑和删除已保存的目标岗位' },
  { to: '/recruiter/upload',      icon: Upload,         title: '简历池上传', desc: '上传简历到招聘者简历池（仅招聘者模式可见）' },
  { to: '/recruiter/pool',        icon: ClipboardList,  title: '简历池管理', desc: '查看、重命名、删除已上传的简历' },
  { to: '/recruiter/score',       icon: Zap,            title: '批量评分',   desc: '选 JD + 简历集 → 异步并发打分 → 进度条' },
  { to: '/recruiter/score',       icon: Trophy,         title: '排行榜',     desc: '从批量评分页选已完成 batch 进入排行榜（需先发起批次）' },
]

/**
 * RecruiterHome — /recruiter/home
 *  四卡片 quick-link 页（Phase 4 修复：原占位卡 → 真实 Link）。
 *  注：排行榜路径 `/recruiter/leaderboard/:batchId` 需要 batch_id，因此入口指向
 *      `/recruiter/score`，用户在那里发起或选择 batch 后跳转。
 *  §8.42: emoji → lucide-react 线性图标，跨平台渲染统一。
 */
export function RecruiterHome() {
  const { mode } = useMode()
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-amber-400">招聘者模式 · /recruiter/home</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">从简历池里高效挑出最匹配的人</h1>
        <p className="text-slate-400">
          录 JD → 批量上传简历 → 异步并发评分 → 排行榜与 CSV 导出。
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => {
          const Icon = c.icon
          return (
            <li key={c.to}>
              <Link
                to={c.to}
                className="group block h-full rounded-xl border border-white/10 bg-[#111827]/60 p-5 transition-all hover:-translate-y-0.5 hover:border-amber-500/40 hover:bg-[#111827]/80 hover:shadow-lg"
              >
                <h3 className="flex items-center gap-2.5 text-base font-semibold text-slate-200 group-hover:text-amber-400">
                  <Icon className="h-5 w-5 text-amber-400" strokeWidth={1.75} />
                  {c.title}
                  <ArrowRight className="ml-auto h-4 w-4 text-slate-500 transition-transform group-hover:translate-x-0.5" />
                </h3>
                <p className="mt-1 text-sm text-slate-400">{c.desc}</p>
              </Link>
            </li>
          )
        })}
      </ul>

      <p className="text-xs text-slate-400">debug · current mode = "{mode}"</p>
    </section>
  )
}
