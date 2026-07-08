import type { WorkbenchFlowNode } from './types'

export function preserveWorkbenchNodeTransientLayout(
  nextNodes: WorkbenchFlowNode[],
  currentNodes: WorkbenchFlowNode[]
): WorkbenchFlowNode[] {
  const currentNodesById = new Map(currentNodes.map((node) => [node.id, node]))

  return nextNodes.map((nextNode) => {
    const currentNode = currentNodesById.get(nextNode.id)

    if (!currentNode || currentNode.type !== nextNode.type) {
      return nextNode
    }

    return {
      ...nextNode,
      position: currentNode.position,
      style: currentNode.style,
      ...(currentNode.width === undefined ? {} : { width: currentNode.width }),
      ...(currentNode.height === undefined ? {} : { height: currentNode.height }),
      ...(currentNode.measured === undefined ? {} : { measured: currentNode.measured }),
      ...(currentNode.dragging === undefined ? {} : { dragging: currentNode.dragging })
    }
  })
}
