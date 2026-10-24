import type { CanvasArrangementProjectionNode } from '../../../contexts/canvas-arrangement/presentation/view-models/canvasArrangementStackingProjection'
import { readAgentIdFromFlowNodeId } from './agentConsoleFlowNode'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'

export function toCanvasArrangementProjectionNodes(
  nodes: readonly WorkbenchFlowNode[]
): CanvasArrangementProjectionNode[] {
  return nodes.flatMap((node): CanvasArrangementProjectionNode[] => {
    if (node.type === 'terminalGroup') {
      return [
        {
          id: node.id,
          memberNodeIds: node.data.group.memberBlockIds,
          reference: { kind: 'combination', terminalGroupId: node.id }
        }
      ]
    }
    if (node.type === 'agentConsole') {
      const agentId = readAgentIdFromFlowNodeId(node.id)
      return agentId ? [{ id: node.id, reference: { kind: 'agent', agentId } }] : []
    }
    return [{ id: node.id, reference: { kind: 'terminal', terminalId: node.id } }]
  })
}
