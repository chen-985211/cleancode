import type { CanvasLayerItemReference } from '../../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { BlockGraphSnapshot } from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { toAgentFlowNodeId, readAgentIdFromFlowNodeId } from '../projections/agentConsoleFlowNode'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'

export function restoreCanvasLayerNodeOrder(
  items: readonly CanvasLayerItemReference[] = []
): string[] {
  return items.map((item) => {
    switch (item.kind) {
      case 'agent':
        return toAgentFlowNodeId(item.agentId)
      case 'combination':
        return item.terminalGroupId
      case 'terminal':
        return item.terminalId
    }
  })
}

export function projectCanvasLayerReferences(
  nodeOrder: readonly string[],
  nodes: readonly WorkbenchFlowNode[],
  graph: BlockGraphSnapshot | null
): CanvasLayerItemReference[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const groupIds = new Set(graph?.terminalGroups.map((group) => group.id))
  return nodeOrder.map((id) => {
    if (byId.get(id)?.type === 'agentConsole') {
      return { kind: 'agent', agentId: readAgentIdFromFlowNodeId(id)! }
    }
    if (byId.get(id)?.type === 'terminalGroup' || groupIds.has(id)) {
      return { kind: 'combination', terminalGroupId: id }
    }
    return { kind: 'terminal', terminalId: id }
  })
}
