import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'
import { collapsedTerminalGroupSize } from './terminalFlowNodes'

// Captured drag rectangles are presentation only. Restore the authoritative
// layout before resuming the shell spring so its endpoint survives re-projection.
export function restoreFrozenTerminalGroups(
  nodes: WorkbenchFlowNode[],
  capturedNodes: readonly WorkbenchFlowNode[],
  graph: WorkbenchSnapshot['graph'],
  operationId: string,
  onComplete: (nodeId: string, motionId: string) => void
): WorkbenchFlowNode[] {
  const capturedById = new Map(capturedNodes.map((node) => [node.id, node]))
  return nodes.map((node) => {
    if (node.type !== 'terminalGroup') return node
    const captured = capturedById.get(node.id)
    const group = graph.terminalGroups.find((candidate) => candidate.id === node.id)
    if (!captured || !group) return node
    const size = group.isCollapsed ? collapsedTerminalGroupSize : group.size
    const from = {
      ...captured.position,
      width: Number(captured.style?.width),
      height: Number(captured.style?.height)
    }
    const to = { ...group.position, ...size }
    const changed =
      from.x !== to.x || from.y !== to.y || from.width !== to.width || from.height !== to.height
    return {
      ...node,
      position: group.position,
      style: { ...node.style, ...size },
      ...(node.style?.width === size.width && node.style?.height === size.height
        ? {}
        : {
            width: undefined,
            height: undefined,
            measured: undefined
          }),
      data: {
        ...node.data,
        group,
        isObjectMotionFrozen: false,
        objectMotion: changed
          ? {
              id: `${operationId}:${node.id}`,
              kind:
                captured.data.objectMotion?.kind === 'group-collapse' ||
                captured.data.objectMotion?.kind === 'group-expand'
                  ? group.isCollapsed
                    ? 'group-collapse'
                    : 'group-expand'
                  : 'group-reflow',
              offset: { x: 0, y: 0 },
              shellRect: { from, to }
            }
          : node.data.objectMotion,
        onObjectMotionComplete: changed
          ? (id: string) => onComplete(node.id, id)
          : node.data.onObjectMotionComplete
      }
    }
  })
}
