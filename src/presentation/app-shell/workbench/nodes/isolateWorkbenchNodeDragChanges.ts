import type { NodeChange } from '@xyflow/react'

import { readAgentIdFromFlowNodeId } from '../../projections/agentConsoleFlowNode'
import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'

export function isolateWorkbenchNodeDragChanges(
  changes: NodeChange<WorkbenchFlowNode>[],
  activeDraggedNode: WorkbenchFlowNode | null
): NodeChange<WorkbenchFlowNode>[] {
  if (!activeDraggedNode) return changes

  return changes.filter((change) => {
    if (change.type !== 'position') {
      return true
    }

    if (activeDraggedNode.type === 'agentConsole') {
      return change.id === activeDraggedNode.id
    }

    return !readAgentIdFromFlowNodeId(change.id)
  })
}
