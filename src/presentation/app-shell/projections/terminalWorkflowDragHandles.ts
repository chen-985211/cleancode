import type { BlockGraphSnapshot } from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { analyzeCanvasExecutionSelection } from '../../../shared-kernel/domain/policies/CanvasExecutionSemantics'

export function terminalWorkflowDragHandles(
  graph: BlockGraphSnapshot | null
): ReadonlyMap<string, readonly string[]> {
  if (!graph) return new Map()
  const hidden = new Set(
    graph.terminalGroups
      .filter((group) => group.isCollapsed)
      .flatMap((group) => group.memberBlockIds)
  )
  const units = analyzeCanvasExecutionSelection({
    terminals: graph.blocks.map((block) => ({ terminalId: block.id })),
    dependencies: (graph.connections ?? []).map((edge) => ({
      sourceTerminalId: edge.sourceBlockId,
      targetTerminalId: edge.targetBlockId
    })),
    selectedTerminalIds: graph.blocks.map((block) => block.id)
  }).topLevelExecutionUnits
  return new Map(
    units
      .filter((unit) => unit.type === 'workflow')
      .map((unit) => {
        const visible = unit.terminalIds.filter((id) => !hidden.has(id))
        const root =
          visible.find(
            (id) => !(graph.connections ?? []).some((edge) => edge.targetBlockId === id)
          ) ??
          visible[0] ??
          unit.terminalIds[0]!
        return [root, [root, ...unit.terminalIds.filter((id) => id !== root)]]
      })
  )
}
