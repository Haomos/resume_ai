import { createContext } from 'react'

export type Mode = 'seeker' | 'recruiter'

export interface ModeContextValue {
  mode: Mode
  setMode: (mode: Mode) => void
}

export const ModeContext = createContext<ModeContextValue | undefined>(undefined)
