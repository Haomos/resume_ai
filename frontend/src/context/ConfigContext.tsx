import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { api, ApiError } from '../api/client'
import type { LLMConfigResponse, LLMConfigUpdate } from '../api/types'
import { ConfigContext } from './config'

type ConfigState =
  | { status: 'loading' }
  | { status: 'ready'; config: LLMConfigResponse }
  | { status: 'error'; message: string }

/**
 * ConfigProvider — 跨模式共享的系统配置（当前主要是 LLM Provider 设置）
 *  - 应用启动时自动 fetch 一次 GET /api/config/llm
 *  - 任意页面通过 useConfig() 读取当前配置
 *  - /settings 页面通过 updateLLM() 写回，本 Provider 自动重读
 *
 * 设计原则: 跨模式共享 (MEMORY.md §0)，与 ModeContext 完全独立。
 */
export function ConfigProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfigState>({ status: 'loading' })

  /** 纯数据获取，不碰 React state（供 mount init 和 refresh 复用） */
  const fetchConfig = useCallback(async (): Promise<ConfigState> => {
    try {
      const config = await api.config.getLLM()
      return { status: 'ready', config }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `HTTP ${err.status} · 配置加载失败`
          : err instanceof Error
            ? err.message
            : '未知错误'
      return { status: 'error', message: msg }
    }
  }, [])

  const refresh = useCallback(async () => {
    setState({ status: 'loading' })
    const next = await fetchConfig()
    setState(next)
  }, [fetchConfig])

  const updateLLM = useCallback(async (patch: LLMConfigUpdate): Promise<LLMConfigResponse> => {
    const config = await api.config.updateLLM(patch)
    setState({ status: 'ready', config })
    return config
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchConfig().then((next) => {
      if (!cancelled) setState(next)
    })
    const onAuth = () => {
      fetchConfig().then((next) => {
        if (!cancelled) setState(next)
      })
    }
    window.addEventListener('resumeai:auth', onAuth)
    return () => {
      cancelled = true
      window.removeEventListener('resumeai:auth', onAuth)
    }
  }, [fetchConfig])

  return (
    <ConfigContext.Provider value={{ state, refresh, updateLLM }}>
      {children}
    </ConfigContext.Provider>
  )
}

