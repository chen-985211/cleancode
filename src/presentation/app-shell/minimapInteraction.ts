import { createContext } from 'react'

import type { TerminalSessionStatus } from '../../contexts/run/application/dto/TerminalSessionSnapshot'

export interface MinimapNodeInteractionContextValue {
  readonly getLabel: (blockId: string) => string
  readonly focusBlock: (blockId: string) => void
  readonly setHoveredBlockId: (blockId: string | null) => void
}

export const MinimapNodeInteractionContext = createContext<MinimapNodeInteractionContextValue>({
  getLabel: (blockId) => blockId,
  focusBlock: () => undefined,
  setHoveredBlockId: () => undefined
})

export function getTerminalStatusColor(status: TerminalSessionStatus): string {
  switch (status) {
    case 'running':
      return '#22c55e'
    case 'failed':
      return '#ef4444'
    case 'exited':
      return '#94a3b8'
    case 'idle':
      return '#93a4bd'
  }
}
