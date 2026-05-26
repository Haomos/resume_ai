import { useContext } from 'react'
import { ConfigContext } from '../context/config'
import type { ConfigContextValue } from '../context/config'

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig must be used inside <ConfigProvider>')
  return ctx
}
