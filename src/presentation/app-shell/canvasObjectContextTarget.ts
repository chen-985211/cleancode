import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  resolveTerminalCanvasObjectContextTarget,
  type TerminalCanvasObjectContextTarget
} from '../../contexts/block-graph/presentation/view-models/terminalCanvasContextTarget'
import { readAgentIdFromFlowNodeId } from './projections/agentConsoleFlowNode'

export type CanvasTerminalObjectContextTarget = TerminalCanvasObjectContextTarget

export type CanvasObjectContextTarget =
  | CanvasTerminalObjectContextTarget
  | {
      readonly agentId: string
      readonly kind: 'agent'
      readonly selectedConnectionIds: readonly string[]
      readonly selectedNodeIds: readonly string[]
    }

export interface CanvasNodeContextHit {
  readonly nodeId: string
  readonly nodeType: 'agentConsole' | 'terminal' | 'terminalGroup'
}

export function resolveCanvasObjectContextTarget(
  graph: BlockGraphSnapshot,
  hit: CanvasNodeContextHit
): CanvasObjectContextTarget | null {
  if (hit.nodeType === 'agentConsole') {
    const agentId = readAgentIdFromFlowNodeId(hit.nodeId)
    return agentId
      ? {
          agentId,
          kind: 'agent',
          selectedConnectionIds: [],
          selectedNodeIds: [hit.nodeId]
        }
      : null
  }

  return resolveTerminalCanvasObjectContextTarget(graph, {
    nodeId: hit.nodeId,
    nodeType: hit.nodeType === 'terminalGroup' ? 'terminalGroup' : 'terminal'
  })
}
