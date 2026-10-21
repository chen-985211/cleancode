import type { WorkbenchFlowNode } from '../types/workbenchFlowNode'

export function preserveWorkbenchNodeTransientLayout(
  nextNodes: WorkbenchFlowNode[],
  currentNodes: WorkbenchFlowNode[],
  protectedNodeIds: ReadonlySet<string> = new Set()
): WorkbenchFlowNode[] {
  const currentNodesById = new Map(currentNodes.map((node) => [node.id, node]))

  return nextNodes.map((nextNode) => {
    const currentNode = currentNodesById.get(nextNode.id)

    if (!currentNode || currentNode.type !== nextNode.type) {
      return nextNode
    }

    if (protectedNodeIds.has(nextNode.id))
      return preserveProtectedLayoutBaseline(nextNode, currentNode)
    if (hasPersistedLayoutChanged(currentNode, nextNode)) {
      // A translation is not a new node. Dropping measured makes React Flow
      // invalidate all handle bounds and remove its edges until remeasurement.
      // A genuine size change still invalidates measurements for ResizeObserver.
      return currentNode.measured && hasSameRenderedSize(currentNode, nextNode)
        ? { ...nextNode, measured: currentNode.measured }
        : nextNode
    }

    return preserveTransientGeometry(nextNode, currentNode)
  })
}

function hasSameRenderedSize(left: WorkbenchFlowNode, right: WorkbenchFlowNode): boolean {
  return (['width', 'height'] as const).every((dimension) => {
    const before = left.style?.[dimension]
    const after = right.style?.[dimension]
    return typeof before === 'number' && typeof after === 'number'
      ? Math.abs(before - after) < 0.001
      : before === after
  })
}

function preserveProtectedLayoutBaseline(
  nextNode: WorkbenchFlowNode,
  currentNode: WorkbenchFlowNode
): WorkbenchFlowNode {
  const nodeWithTransientGeometry = preserveTransientGeometry(nextNode, currentNode)

  if (nodeWithTransientGeometry.type === 'terminal' && currentNode.type === 'terminal') {
    return {
      ...nodeWithTransientGeometry,
      data: {
        ...nodeWithTransientGeometry.data,
        isObjectMotionFrozen: currentNode.data.isObjectMotionFrozen,
        isParkedInCollapsedGroup: currentNode.data.isParkedInCollapsedGroup,
        isObjectDragPreview: currentNode.data.isObjectDragPreview,
        block: {
          ...nodeWithTransientGeometry.data.block,
          position: currentNode.data.block.position,
          size: currentNode.data.block.size
        }
      }
    }
  }

  if (nodeWithTransientGeometry.type === 'terminalGroup' && currentNode.type === 'terminalGroup') {
    return {
      ...nodeWithTransientGeometry,
      data: {
        ...nodeWithTransientGeometry.data,
        isObjectMotionFrozen: currentNode.data.isObjectMotionFrozen,
        group: {
          ...nodeWithTransientGeometry.data.group,
          position: currentNode.data.group.position,
          size: currentNode.data.group.size,
          isCollapsed: currentNode.data.group.isCollapsed,
          memberBlockIds: currentNode.data.group.memberBlockIds
        }
      }
    }
  }

  if (nodeWithTransientGeometry.type === 'agentConsole' && currentNode.type === 'agentConsole') {
    return {
      ...nodeWithTransientGeometry,
      data: {
        ...nodeWithTransientGeometry.data,
        agent: {
          ...nodeWithTransientGeometry.data.agent,
          layout: currentNode.data.agent.layout
        }
      }
    }
  }

  return nodeWithTransientGeometry
}

function preserveTransientGeometry(
  nextNode: WorkbenchFlowNode,
  currentNode: WorkbenchFlowNode
): WorkbenchFlowNode {
  // A data refresh can follow pointer-up before the return spring finishes.
  // Keep its motion and completion owner visible to both nodes and edges until
  // completion clears it, or a new authoritative layout/motion replaces it.
  const activeMotion =
    !nextNode.data.objectMotion &&
    currentNode.data.objectMotion &&
    !currentNode.data.isObjectMotionFrozen
      ? {
          objectMotion: currentNode.data.objectMotion,
          onObjectMotionComplete: currentNode.data.onObjectMotionComplete
        }
      : {}
  if (nextNode.type === 'terminalGroup' && currentNode.type === 'terminalGroup') {
    return {
      ...nextNode,
      data: { ...nextNode.data, ...activeMotion, dropFeedback: currentNode.data.dropFeedback },
      position: currentNode.position,
      style: currentNode.style,
      ...(currentNode.width === undefined ? {} : { width: currentNode.width }),
      ...(currentNode.height === undefined ? {} : { height: currentNode.height }),
      ...(currentNode.measured === undefined ? {} : { measured: currentNode.measured }),
      ...(currentNode.dragging === undefined ? {} : { dragging: currentNode.dragging })
    }
  }

  return {
    ...nextNode,
    data: { ...nextNode.data, ...activeMotion },
    position: currentNode.position,
    style: currentNode.style,
    ...(currentNode.width === undefined ? {} : { width: currentNode.width }),
    ...(currentNode.height === undefined ? {} : { height: currentNode.height }),
    ...(currentNode.measured === undefined ? {} : { measured: currentNode.measured }),
    ...(currentNode.dragging === undefined ? {} : { dragging: currentNode.dragging })
  } as WorkbenchFlowNode
}

function hasPersistedLayoutChanged(
  currentNode: WorkbenchFlowNode,
  nextNode: WorkbenchFlowNode
): boolean {
  if (currentNode.type === 'terminal' && nextNode.type === 'terminal') {
    return (
      !isPositionEqual(currentNode.data.block.position, nextNode.data.block.position) ||
      !isSizeEqual(currentNode.data.block.size, nextNode.data.block.size) ||
      Boolean(currentNode.data.block.isCollapsed) !== Boolean(nextNode.data.block.isCollapsed)
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

  if (currentNode.type === 'agentConsole' && nextNode.type === 'agentConsole') {
    return (
      !isPositionEqual(
        currentNode.data.agent.layout.position,
        nextNode.data.agent.layout.position
      ) || !isSizeEqual(currentNode.data.agent.layout.size, nextNode.data.agent.layout.size)
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
