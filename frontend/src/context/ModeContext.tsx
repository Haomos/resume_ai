import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ModeContext } from './mode'

export type Mode = 'seeker' | 'recruiter'

const STORAGE_KEY = 'resumeai.mode'
const DEFAULT_MODE: Mode = 'seeker'

function readStoredMode(): Mode {
  if (typeof window === 'undefined') return DEFAULT_MODE
  const v = window.localStorage.getItem(STORAGE_KEY)
  return v === 'recruiter' ? 'recruiter' : DEFAULT_MODE
}

/**
 * ModeProvider
 *  - state: mode ∈ {'seeker','recruiter'}
 *  - 持久化: localStorage[resumeai.mode]
 *  - URL → mode 单向同步: 用户直达 /seeker/* 或 /recruiter/* 时自动同步状态
 *  - mode → URL 主动跳转: setMode('xxx') 会 navigate('/xxx/home')
 *
 * 设计动机参见 MEMORY.md §0 (mode-switch-isolation): 跨模式禁止共享 in-memory 状态。
 */
export function ModeProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()

  // 初始化时从 URL 读取，避免 mount 后同步 setState（React 19 级联渲染）
  const [mode, setModeState] = useState<Mode>(() => {
    const seg = location.pathname.split('/')[1]
    if (seg === 'seeker' || seg === 'recruiter') {
      window.localStorage.setItem(STORAGE_KEY, seg)
      return seg
    }
    return readStoredMode()
  })

  // URL → mode 单向同步：pathname 变化时异步更新，避免 React 19 级联渲染
  useEffect(() => {
    const seg = location.pathname.split('/')[1]
    if ((seg === 'seeker' || seg === 'recruiter') && seg !== mode) {
      queueMicrotask(() => {
        setModeState(seg)
        window.localStorage.setItem(STORAGE_KEY, seg)
      })
    }
    // 故意只依赖 pathname: 避免 setMode → navigate 触发的闭环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const setMode = useCallback(
    (next: Mode) => {
      if (next === mode) return
      setModeState(next)
      window.localStorage.setItem(STORAGE_KEY, next)
      navigate(`/${next}/home`)
    },
    [mode, navigate],
  )

  return <ModeContext.Provider value={{ mode, setMode }}>{children}</ModeContext.Provider>
}

