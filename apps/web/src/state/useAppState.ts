import { useContext } from 'react'
import { AppStateContext, type AppStateValue } from './app-state-context'

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
