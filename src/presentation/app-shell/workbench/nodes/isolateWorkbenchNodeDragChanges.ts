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

    // Inside a workflow or combination, a terminal title grabs just that terminal.
    // Independent terminals retain intentional multi-selection / stack dragging.
    if (
      activeDraggedNode.type === 'terminal' &&
      activeDraggedNode.data.isIndependentCanvasTerminal !== false
    )
      return !readAgentIdFromFlowNodeId(change.id)
    return change.id === activeDraggedNode.id
  })
}
