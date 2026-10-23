import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'

// Returning inside the same container is a presentation change. The graph and
// every sibling keep their original slots; the shared spring owns the return.
export function restoreTerminalDragSlots(
  nodes: WorkbenchFlowNode[],
  baseline: readonly WorkbenchFlowNode[],
  movedIds: ReadonlySet<string>,
  operationId: string,
  onComplete?: (nodeId: string, motionId: string) => void
): WorkbenchFlowNode[] {
  const originals = new Map(baseline.map((node) => [node.id, node]))
  return nodes.map((node) => {
    const original = originals.get(node.id)
    if (!original || (!movedIds.has(node.id) && node.type !== 'terminalGroup')) return node
    const offset = {
      x: node.position.x - original.position.x,
      y: node.position.y - original.position.y
    }
    return {
      ...node,
      position: original.position,
      style: original.style,
      dragging: false,
      data: {
        ...node.data,
        isObjectMotionFrozen: false,
        isObjectDragPreview: false,
        onObjectMotionComplete:
          movedIds.has(node.id) && onComplete
            ? (motionId: string) => onComplete(node.id, motionId)
            : original.data.onObjectMotionComplete,
        objectMotion:
          movedIds.has(node.id) && (offset.x || offset.y)
            ? { id: `${operationId}:${node.id}`, kind: 'group-reflow', offset }
            : undefined
      }
    } as WorkbenchFlowNode
  })
}
