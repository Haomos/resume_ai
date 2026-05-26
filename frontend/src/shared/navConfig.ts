/**
 * 侧边栏导航配置
 * - todo: true 表示该路由 Phase 2a 暂未实现，菜单项灰显并标 TODO
 * - 模式专属菜单按 ModeContext 切换；底部 sharedBottomNav 跨模式共享
 */

export interface NavItem {
  to: string
  label: string
  icon: string
  todo?: boolean
}

export const seekerNav: NavItem[] = [
  { to: '/seeker/home',     label: '主页',       icon: '🏠' },
  { to: '/seeker/pool',     label: '我的档案',   icon: '📁' },
  { to: '/seeker/resumes',  label: '我的简历',   icon: '📄' },
  { to: '/seeker/jobs',     label: '录入岗位',   icon: '🎯' },
  { to: '/seeker/jobs/manage', label: '岗位管理', icon: '🗂️' },
  { to: '/seeker/analyze',  label: '开始分析',   icon: '⚖️' },
  { to: '/seeker/history',  label: '历史记录',   icon: '🕒' },
]

export const recruiterNav: NavItem[] = [
  { to: '/recruiter/home',        label: '主页',     icon: '🏠' },
  { to: '/recruiter/upload',      label: '简历池上传', icon: '📤' },
  { to: '/recruiter/pool',        label: '简历池管理', icon: '📋' },
  { to: '/recruiter/jobs',        label: '录入岗位', icon: '🎯' },
  { to: '/recruiter/jobs/manage', label: '岗位管理', icon: '🗂️' },
  { to: '/recruiter/score',       label: '批量评分', icon: '⚡' },
  { to: '/recruiter/leaderboard', label: '排行榜',   icon: '🏆' }
]

/** 跨模式共享的底部菜单（设置等） */
export const sharedBottomNav: NavItem[] = [
  { to: '/settings', label: '设置', icon: '⚙️' },
]
