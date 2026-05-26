import { createContext } from 'react'
import type { LLMConfigResponse, LLMConfigUpdate } from '../api/types'

type ConfigState =
  | { status: 'loading' }
  | { status: 'ready'; config: LLMConfigResponse }
  | { status: 'error'; message: string }

export interface ConfigContextValue {
  state: ConfigState
  refresh: () => Promise<void>
  updateLLM: (patch: LLMConfigUpdate) => Promise<LLMConfigResponse>
}

export const ConfigContext = createContext<ConfigContextValue | undefined>(undefined)
