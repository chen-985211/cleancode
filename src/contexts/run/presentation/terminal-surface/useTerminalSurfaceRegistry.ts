import { useContext } from 'react'

import { TerminalSurfaceRegistryContext } from './terminalSurfaceRegistryContext'
import type { TerminalSurfaceRegistry } from './terminalSurfaceRegistry'

export function useTerminalSurfaceRegistry(): TerminalSurfaceRegistry | null {
  return useContext(TerminalSurfaceRegistryContext)
}
