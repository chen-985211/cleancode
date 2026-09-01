import { createContext } from 'react'

import type { TerminalSurfaceRegistry } from './terminalSurfaceRegistry'

export const TerminalSurfaceRegistryContext = createContext<TerminalSurfaceRegistry | null>(null)
