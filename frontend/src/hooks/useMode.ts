import { useContext } from 'react'
import { ModeContext } from '../context/mode'
import type { ModeContextValue } from '../context/mode'

export function useMode(): ModeContextValue {
  const ctx = useContext(ModeContext)
  if (!ctx) throw new Error('useMode must be used inside <ModeProvider>')
  return ctx
}
