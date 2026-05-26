import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * LandingPage — Portfolio 风格首页
 *
 * 设计来源：深色科技风 / AI 产品定位
 * - 独立全屏，不依赖 Layout（无 sidebar/header/footer）
 * - 纯展示，无业务逻辑
 */
export default function LandingPage() {
  const techs = [
    { name: 'React 19', highlight: true },
    { name: 'FastAPI', highlight: true },
    { name: 'LLM', highlight: true },
    { name: 'TypeScript', highlight: false },
    { name: 'Tailwind CSS', highlight: false },
    { name: 'SQLAlchemy', highlight: false },
    { name: 'Playwright', highlight: false },
    { name: 'Docker', highlight: false },
    { name: 'RAG', highlight: false },
    { name: 'Prompt Engineering', highlight: false },
  ]

  const features = [
    {
      icon: '📝',
      title: '档案管理',
      desc: '维护结构化简历档案，支持从 PDF 导入工作经历、项目经验，AI 自动提取并归档。',
    },
    {
      icon: '📊',
      title: '智能评分',
      desc: '5 维度契合度评估（技能匹配 / 经验深度 / 领域契合 / 经历相关性 / 硬性条件），LLM 驱动分析。',
    },
    {
      icon: '🎯',
      title: '投递生成',
      desc: '基于档案与 JD 一键生成投递版本，AI 选取最相关经历、自动润色措辞，支持导出 PDF。',
    },
    {
      icon: '⚡',
      title: '批量处理',
      desc: '招聘者模式支持批量简历评分，asyncio 并发 + SSE 实时进度推送，20 份简历秒级完成。',
    },
    {
      icon: '🔒',
      title: '本地部署',
      desc: '数据不出本机，SQLite + 本地文件存储，Ollama 兼容，零云端依赖，隐私绝对可控。',
    },
    {
      icon: '🐳',
      title: 'Docker 一键启动',
      desc: 'docker compose up -d --build 即可运行，前后端双容器 + nginx 反代 + alembic 自动迁移。',
    },
  ]

  const { isAuthenticated, logout } = useAuth()

  return (
    <div className="lp-dark-scroll relative min-h-screen overflow-x-hidden bg-[#0a0e1a] font-sans text-slate-50">
      {/* 背景网格 */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            'linear-gradient(rgba(6,182,212,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.03) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />

      {/* 光晕 1 — cyan */}
      <div
        className="pointer-events-none fixed -left-24 -top-24 z-0 h-[500px] w-[500px] animate-lp-glow rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(6,182,212,0.22) 0%, transparent 70%)',
        }}
      />

      {/* 光晕 2 — violet */}
      <div
        className="pointer-events-none fixed -bottom-24 -right-24 z-0 h-[400px] w-[400px] animate-lp-glow rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
          animationDelay: '4s',
        }}
      />

      {/* 导航栏 */}
      <nav className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between border-b border-white/5 bg-[#0a0e1a]/80 px-6 py-4 backdrop-blur-xl sm:px-12">
        <div className="text-xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-cyan-400 to-violet-500 bg-clip-text text-transparent">
            ResumeAI
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium">
          {isAuthenticated ? (
            <>
              <Link
                to="/seeker/home"
                className="rounded-lg bg-cyan-600 px-4 py-2 text-white shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-500"
              >
                进入产品
              </Link>
              <button
                onClick={logout}
                className="text-slate-400 transition-colors hover:text-cyan-400"
              >
                退出
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="text-slate-400 transition-colors hover:text-cyan-400"
              >
                登录
              </Link>
              <Link
                to="/register"
                className="rounded-lg bg-cyan-600 px-4 py-2 text-white shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-500"
              >
                注册
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6 pb-20 pt-32 text-center sm:px-12">
        {/* Badge */}
        <div className="animate-lp-pulse mb-8 inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-5 py-2 text-sm font-medium text-cyan-400">
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          AI 驱动的简历分析与投递助手
        </div>

        {/* 标题 */}
        <h1 className="mb-6 text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
          <span className="bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            让每一份简历
            <br />
            都精准匹配岗位
          </span>
        </h1>

        {/* 副标题 */}
        <p className="mb-10 max-w-xl text-lg leading-relaxed text-slate-400 sm:text-xl">
          基于大模型技术，为求职者生成投递版本、为招聘者批量评分。
          <br className="hidden sm:block" />
          本地部署，隐私优先，Docker 一键启动。
        </p>

        {/* Tech Stack */}
        <div className="mb-10 flex max-w-2xl flex-wrap justify-center gap-3">
          {techs.map((t) => (
            <span
              key={t.name}
              className={[
                'rounded-lg border px-4 py-1.5 text-sm transition-all duration-300',
                t.highlight
                  ? 'border-cyan-500/40 bg-cyan-500/15 font-semibold text-cyan-400'
                  : 'border-white/10 bg-white/5 text-slate-400 hover:-translate-y-0.5 hover:border-cyan-500/40 hover:text-cyan-400',
              ].join(' ')}
            >
              {t.name}
            </span>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-4 sm:flex-row">
          {isAuthenticated ? (
            <Link
              to="/seeker/home"
              className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all hover:-translate-y-0.5 hover:shadow-cyan-500/40"
            >
              进入产品
            </Link>
          ) : (
            <>
              <Link
                to="/register"
                className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-cyan-500/25 transition-all hover:-translate-y-0.5 hover:shadow-cyan-500/40"
              >
                立即注册
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-transparent px-8 py-3.5 text-base font-semibold text-slate-400 transition-all hover:border-cyan-500/40 hover:text-cyan-400"
              >
                已有账号？登录 →
              </Link>
            </>
          )}
        </div>
      </section>

      {/* Features */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-32 pt-16 sm:px-12">
        <div className="mb-16 text-center">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
            Features
          </div>
          <h2 className="mb-3 text-3xl font-bold sm:text-4xl">核心能力</h2>
          <p className="text-slate-400">从档案管理到投递生成，AI 全链路赋能</p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <article
              key={f.title}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-[#111827]/60 p-7 transition-all duration-500 hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-[#111827]/80 hover:shadow-2xl hover:shadow-black/50"
            >
              {/* 顶部渐变条 */}
              <div className="absolute left-0 right-0 top-0 h-0.5 bg-gradient-to-r from-cyan-500 via-violet-500 to-cyan-500 transition-transform duration-500 group-hover:scale-x-100" style={{ transform: 'scaleX(0)' }} />

              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-violet-500 text-xl">
                {f.icon}
              </div>

              <h3 className="mb-2 text-lg font-bold">{f.title}</h3>
              <p className="text-[15px] leading-relaxed text-slate-400">
                {f.desc}
              </p>
            </article>
          ))}
        </div>

        {/* 核心数据条 */}
        <div className="mt-16 flex flex-wrap justify-center gap-8 rounded-2xl border border-white/10 bg-[#111827]/40 p-8 sm:gap-16">
          {[
            { value: '160/160', label: 'Backend 测试通过' },
            { value: '5', label: '评估维度' },
            { value: '2', label: '双模式（求职者/招聘者）' },
            { value: '1', label: 'Docker Compose 一键启动' },
          ].map((s) => (
            <div key={s.label} className="flex flex-col items-center">
              <span className="text-2xl font-bold text-cyan-400">{s.value}</span>
              <span className="mt-1 text-sm text-slate-500">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-10 text-center text-sm text-slate-500">
        <p>ResumeAI · 本地部署 · 隐私优先 · 用 AI 构建未来</p>
      </footer>
    </div>
  )
}
