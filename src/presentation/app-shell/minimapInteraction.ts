import { createContext } from 'react'

import type { TerminalSessionStatus } from '../../contexts/run/application/dto/TerminalSessionSnapshot'

export interface MinimapNodeInteractionContextValue {
  readonly getLabel: (blockId: string) => string
  readonly setHoveredBlockId: (blockId: string | null) => void
}

export const MinimapNodeInteractionContext = createContext<MinimapNodeInteractionContextValue>({
  getLabel: (blockId) => blockId,
  setHoveredBlockId: () => undefined
})

export function getTerminalStatusColor(status: TerminalSessionStatus): string {
  switch (status) {
    case 'running':
      return 'var(--cc-success)'
    case 'failed':
      return 'var(--cc-danger)'
    case 'exited':
      return '#94a3b8'
    case 'idle':
      return '#93a4bd'
  }
}
