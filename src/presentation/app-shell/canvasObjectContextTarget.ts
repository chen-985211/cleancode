import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { analyzeCanvasExecutionSelection } from '../../shared-kernel/domain/policies/CanvasExecutionSemantics'

export type CanvasObjectContextTarget =
  | {
      readonly kind: 'terminal'
      readonly selectedConnectionIds: readonly string[]
      readonly selectedNodeIds: readonly string[]
      readonly terminalBlockIds: readonly string[]
    }
  | {
      readonly kind: 'workflow'
      readonly selectedConnectionIds: readonly string[]
      readonly selectedNodeIds: readonly string[]
      readonly terminalBlockIds: readonly string[]
    }
  | {
      readonly groupId: string
      readonly kind: 'combination'
      readonly selectedConnectionIds: readonly string[]
      readonly selectedNodeIds: readonly string[]
      readonly terminalBlockIds: readonly string[]
    }

export interface CanvasNodeContextHit {
  readonly nodeId: string
  readonly nodeType: 'agentConsole' | 'terminal' | 'terminalGroup'
}

export function resolveCanvasObjectContextTarget(
  graph: BlockGraphSnapshot,
  hit: CanvasNodeContextHit
): CanvasObjectContextTarget | null {
  const connections = graph.connections ?? []

  if (hit.nodeType === 'terminalGroup') {
    const group = graph.terminalGroups.find((candidate) => candidate.id === hit.nodeId)
    if (!group) return null

    return {
      groupId: group.id,
      kind: 'combination',
      selectedConnectionIds: [],
      selectedNodeIds: [group.id],
      terminalBlockIds: [...group.memberBlockIds]
    }
  }

  if (hit.nodeType !== 'terminal' || !graph.blocks.some((block) => block.id === hit.nodeId)) {
    return null
  }

  const analysis = analyzeCanvasExecutionSelection({
    terminals: graph.blocks.map((block) => ({ terminalId: block.id })),
    dependencies: connections.map((connection) => ({
      sourceTerminalId: connection.sourceBlockId,
      targetTerminalId: connection.targetBlockId
    })),
    selectedTerminalIds: [hit.nodeId]
  })

  if (analysis.classification === 'terminal') {
    return {
      kind: 'terminal',
      selectedConnectionIds: [],
      selectedNodeIds: [hit.nodeId],
      terminalBlockIds: [hit.nodeId]
    }
  }

  if (analysis.classification !== 'workflow') return null

  const terminalBlockIdSet = new Set(analysis.expandedTerminalIds)

  return {
    kind: 'workflow',
    selectedConnectionIds: connections
      .filter(
        (connection) =>
          terminalBlockIdSet.has(connection.sourceBlockId) &&
          terminalBlockIdSet.has(connection.targetBlockId)
      )
      .map((connection) => connection.id),
    selectedNodeIds: [...analysis.expandedTerminalIds],
    terminalBlockIds: [...analysis.expandedTerminalIds]
  }
}
