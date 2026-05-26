import { Link } from 'react-router-dom'
import {
  Upload,
  Target,
  FolderKanban,
  FileText,
  BarChart3,
  History,
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
  { to: '/seeker/pool',    icon: FileText,     title: '我的档案',     desc: '维护完整职业履历（工作/项目/技能）' },
  { to: '/seeker/resumes', icon: FileText,     title: '我的简历',     desc: '基于档案生成的定向投递版本' },
  { to: '/seeker/upload',  icon: Upload,       title: '导入材料',     desc: '上传旧简历 PDF，AI 提取到档案' },
  { to: '/seeker/jobs',    icon: Target,       title: '录入岗位',     desc: '粘贴文本或粘贴链接一键抓取' },
  { to: '/seeker/jobs/manage', icon: FolderKanban, title: '岗位管理', desc: '查看、编辑和删除已保存的目标岗位' },
  { to: '/seeker/analyze', icon: BarChart3,    title: '开始分析',     desc: '评估档案与岗位契合度，获得投递建议' },
  { to: '/seeker/history', icon: History,      title: '历史记录',     desc: '检索往次分析结果' },
]

/**
 * SeekerHome — /seeker/home
 *  四卡片 quick-link 页（Phase 4 修复：原占位卡 → 真实 Link）。
 *  每张卡片直达对应功能页；样式上 hover 抬升 + seeker 主题色边框。
 *  §8.42: emoji → lucide-react 线性图标，跨平台渲染统一。
 */
export function SeekerHome() {
  const { mode } = useMode()
  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-cyan-400">求职者模式 · /seeker/home</p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50">用 AI 把简历调到岗位最佳契合度</h1>
        <p className="text-slate-400">
          维护档案 → 输入目标 JD → AI 生成投递版本 → 评估匹配度 → 导出 PDF。
        </p>
      </header>

      <ul className="grid gap-4 sm:grid-cols-2">
        {CARDS.map((c) => {
          const Icon = c.icon
          return (
            <li key={c.to}>
              <Link
                to={c.to}
                className="group block h-full rounded-xl border border-white/10 bg-[#111827]/60 p-5 transition-all hover:-translate-y-0.5 hover:border-cyan-500/40 hover:bg-[#111827]/80 hover:shadow-lg"
              >
                <h3 className="flex items-center gap-2.5 text-base font-semibold text-slate-200 group-hover:text-cyan-400">
                  <Icon className="h-5 w-5 text-cyan-400" strokeWidth={1.75} />
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
