import { createContext } from 'react'

import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type {
  TerminalBlockSnapshot,
  TerminalGroupSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalSessionStatus } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import { readAgentIdFromFlowNodeId } from './agentConsoleFlowNode'
import type { MinimapFlowNode, WorkbenchFlowNode } from './types'

export interface MinimapNodeInteractionContextValue {
  readonly getLabel: (blockId: string) => string
  readonly setHoveredBlockId: (blockId: string | null) => void
}

export const MinimapNodeInteractionContext = createContext<MinimapNodeInteractionContextValue>({
  getLabel: (blockId) => blockId,
  setHoveredBlockId: () => undefined
})

export function createMinimapNodeInteraction(input: {
  readonly agents?: readonly WorkspaceAgentSnapshot[]
  readonly setHoveredBlockId: (blockId: string | null) => void
  readonly terminalBlocksById: ReadonlyMap<string, TerminalBlockSnapshot>
  readonly terminalGroupsById: ReadonlyMap<string, TerminalGroupSnapshot>
}): MinimapNodeInteractionContextValue {
  return {
    getLabel: (blockId) => {
      const agentId = readAgentIdFromFlowNodeId(blockId)

      return agentId
        ? (input.agents?.find((agent) => agent.agentId === agentId)?.name ?? 'Agent 1')
        : (input.terminalBlocksById.get(blockId)?.name ??
            input.terminalGroupsById.get(blockId)?.name ??
            blockId)
    },
    setHoveredBlockId: input.setHoveredBlockId
  }
}

export function filterMinimapNodes(nodes: readonly WorkbenchFlowNode[]): MinimapFlowNode[] {
  return nodes.filter(
    (node): node is MinimapFlowNode =>
      node.type === 'agentConsole' ||
      node.type === 'terminal' ||
      (node.type === 'terminalGroup' && node.data.group.isCollapsed)
  )
}

export function getTerminalStatusColor(status: TerminalSessionStatus): string {
  switch (status) {
    case 'running':
      return 'var(--cc-success)'
    case 'failed':
      return 'var(--cc-danger)'
    case 'stopping':
      return 'var(--cc-warning)'
    case 'exited':
      return 'var(--cc-muted)'
    case 'idle':
      return 'var(--cc-muted)'
  }
}
