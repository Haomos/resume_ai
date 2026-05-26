import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error('请填写邮箱和密码')
      return
    }
    if (password.length < 6) {
      toast.error('密码至少 6 位')
      return
    }
    if (password !== confirm) {
      toast.error('两次密码不一致')
      return
    }
    setLoading(true)
    try {
      await register(email, password)
      toast.success('注册成功')
      navigate('/seeker/home', { replace: true })
    } catch (err: any) {
      toast.error(err.message || '注册失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0a0e1a] px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-[#111827]/80 p-8 shadow-2xl backdrop-blur">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-white">创建账号</h1>
          <p className="mt-2 text-sm text-slate-400">注册后即可使用 ResumeAI 全部功能</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0a0e1a] px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0a0e1a] px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300">确认密码</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="再次输入密码"
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#0a0e1a] px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-500 disabled:opacity-60"
          >
            {loading ? '注册中…' : '注册'}
          </button>
        </form>

        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          演示提示：邮箱无需验证，密码至少 6 位。
        </div>

        <p className="text-center text-sm text-slate-400">
          已有账号？{' '}
          <Link to="/login" className="font-medium text-cyan-400 hover:text-cyan-300">去登录</Link>
        </p>
      </div>
    </div>
  )
}
