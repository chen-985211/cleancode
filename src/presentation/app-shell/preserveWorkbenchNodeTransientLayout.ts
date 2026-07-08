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

    if (hasPersistedLayoutChanged(currentNode, nextNode)) {
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

function hasPersistedLayoutChanged(
  currentNode: WorkbenchFlowNode,
  nextNode: WorkbenchFlowNode
): boolean {
  if (currentNode.type === 'terminal' && nextNode.type === 'terminal') {
    return (
      !isPositionEqual(currentNode.data.block.position, nextNode.data.block.position) ||
      !isSizeEqual(currentNode.data.block.size, nextNode.data.block.size)
    )
  }

  if (currentNode.type === 'terminalGroup' && nextNode.type === 'terminalGroup') {
    return (
      !isPositionEqual(currentNode.data.group.position, nextNode.data.group.position) ||
      !isSizeEqual(currentNode.data.group.size, nextNode.data.group.size) ||
      currentNode.data.group.isCollapsed !== nextNode.data.group.isCollapsed ||
      !areMemberBlockIdsEqual(
        currentNode.data.group.memberBlockIds,
        nextNode.data.group.memberBlockIds
      )
    )
  }

  return false
}

function isPositionEqual(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number }
): boolean {
  return left.x === right.x && left.y === right.y
}

function isSizeEqual(
  left: { readonly width: number; readonly height: number },
  right: { readonly width: number; readonly height: number }
): boolean {
  return left.width === right.width && left.height === right.height
}

function areMemberBlockIdsEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((memberBlockId, index) => memberBlockId === right[index])
  )
}
