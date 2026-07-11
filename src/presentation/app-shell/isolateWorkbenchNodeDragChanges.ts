import type { NodeChange } from '@xyflow/react'

import type { WorkbenchFlowNode } from './types'

export function isolateWorkbenchNodeDragChanges(
  changes: NodeChange<WorkbenchFlowNode>[],
  nodes: WorkbenchFlowNode[],
  activeDraggedNodeId: string | null
): NodeChange<WorkbenchFlowNode>[] {
  if (!activeDraggedNodeId) {
    return changes
  }

  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const activeNode = nodesById.get(activeDraggedNodeId)

  if (!activeNode) {
    return changes
  }

  return changes.filter((change) => {
    if (change.type !== 'position') {
      return true
    }

    if (activeNode.type === 'agentConsole') {
      return change.id === activeNode.id
    }

    const changedNode = nodesById.get(change.id)
    return changedNode?.type !== 'agentConsole'
  })
}
