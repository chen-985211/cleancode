import type { ReactNode } from 'react'

import { TerminalSurfaceRegistryContext } from '../terminal-surface/terminalSurfaceRegistryContext'
import type { TerminalSurfaceRegistry } from '../terminal-surface/terminalSurfaceRegistry'

export function TerminalSurfaceRegistryProvider({
  children,
  registry
}: {
  readonly children: ReactNode
  readonly registry: TerminalSurfaceRegistry
}) {
  return (
    <TerminalSurfaceRegistryContext.Provider value={registry}>
      {children}
    </TerminalSurfaceRegistryContext.Provider>
  )
}
