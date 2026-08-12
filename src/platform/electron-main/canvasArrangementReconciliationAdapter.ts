import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { CanvasArrangementSnapshot } from '../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import { CanvasArrangement } from '../../contexts/canvas-arrangement/domain/aggregates/CanvasArrangement'
import { analyzeCanvasExecutionSelection } from '../../shared-kernel/domain/policies/CanvasExecutionSemantics'

export function resolveValidCanvasArrangementItemKeys(
  arrangement: CanvasArrangementSnapshot,
  graph: BlockGraphSnapshot,
  agents: readonly WorkspaceAgentSnapshot[]
): string[] {
  const groupedTerminalIds = new Set(
    graph.terminalGroups.flatMap((group) => [...group.memberBlockIds])
  )
  const rootTerminalIds = graph.blocks
    .map((block) => block.id)
    .filter((blockId) => !groupedTerminalIds.has(blockId))
  const rootTerminalIdSet = new Set(rootTerminalIds)
  const executionUnits = analyzeCanvasExecutionSelection({
    terminals: rootTerminalIds.map((terminalId) => ({ terminalId })),
    dependencies: (graph.connections ?? [])
      .filter(
        (connection) =>
          rootTerminalIdSet.has(connection.sourceBlockId) &&
          rootTerminalIdSet.has(connection.targetBlockId)
      )
      .map((connection) => ({
        sourceTerminalId: connection.sourceBlockId,
        targetTerminalId: connection.targetBlockId
      })),
    selectedTerminalIds: rootTerminalIds
  }).topLevelExecutionUnits
  const validKeys = new Set<string>()

  executionUnits.forEach((unit) => {
    validKeys.add(
      CanvasArrangement.itemKey(
        unit.type === 'terminal'
          ? { kind: 'terminal', terminalId: unit.terminalIds[0]! }
          : { kind: 'workflow', terminalIds: unit.terminalIds }
      )
    )
  })
  graph.terminalGroups.forEach((group) =>
    validKeys.add(CanvasArrangement.itemKey({ kind: 'combination', terminalGroupId: group.id }))
  )
  agents.forEach((agent) =>
    validKeys.add(CanvasArrangement.itemKey({ kind: 'agent', agentId: agent.agentId }))
  )

  return arrangement.stacks
    .flatMap((stack) => stack.items)
    .map(CanvasArrangement.itemKey)
    .filter((key, index, keys) => validKeys.has(key) && keys.indexOf(key) === index)
}
