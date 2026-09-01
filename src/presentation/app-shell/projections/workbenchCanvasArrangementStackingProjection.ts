import type { CanvasArrangementSnapshot } from '../../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import {
  createCanvasArrangementStackingZIndexProjection,
  type CanvasArrangementProjectionNode
} from '../../../contexts/canvas-arrangement/presentation/view-models/canvasArrangementStackingProjection'
import { readAgentIdFromFlowNodeId } from './agentConsoleFlowNode'
import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'

export function projectCanvasArrangementStackingOntoNodes(
  arrangement: CanvasArrangementSnapshot | undefined,
  nodes: readonly WorkbenchFlowNode[]
): WorkbenchFlowNode[] {
  if (!arrangement || arrangement.stacks.length === 0) return [...nodes]
  const zIndexByNodeId = createCanvasArrangementStackingZIndexProjection(
    arrangement,
    toCanvasArrangementProjectionNodes(nodes)
  )

  return nodes.map((node) => {
    const zIndex = zIndexByNodeId.get(node.id)
    return zIndex === undefined ? node : ({ ...node, zIndex } as WorkbenchFlowNode)
  })
}

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
