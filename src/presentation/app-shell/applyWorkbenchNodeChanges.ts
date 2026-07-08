import { applyNodeChanges, type NodeChange } from '@xyflow/react'

import type { TerminalFlowNode, TerminalGroupFlowNode, WorkbenchFlowNode } from './types'

const terminalGroupShellPadding = {
  x: 32,
  y: 76
}

export function applyWorkbenchNodeChanges(
  changes: NodeChange<WorkbenchFlowNode>[],
  nodes: WorkbenchFlowNode[]
): WorkbenchFlowNode[] {
  const groupDeltas = collectTerminalGroupDragDeltas(changes, nodes)
  const changedNodes = applyNodeChanges(changes, nodes)

  if (groupDeltas.length === 0) {
    return resizeExpandedTerminalGroupShells(changedNodes)
  }

  return resizeExpandedTerminalGroupShells(
    changedNodes.map((node) => {
      if (node.type !== 'terminal') {
        return node
      }

      const delta = groupDeltas.find((entry) => entry.memberBlockIds.has(node.id))

      return delta ? moveNodeByDelta(node, delta) : node
    })
  )
}

interface TerminalGroupDragDelta {
  readonly memberBlockIds: ReadonlySet<string>
  readonly x: number
  readonly y: number
}

function collectTerminalGroupDragDeltas(
  changes: NodeChange<WorkbenchFlowNode>[],
  nodes: WorkbenchFlowNode[]
): TerminalGroupDragDelta[] {
  return changes.flatMap((change) => {
    if (change.type !== 'position' || !change.position) {
      return []
    }

    const groupNode = nodes.find(
      (node): node is TerminalGroupFlowNode =>
        node.id === change.id && node.type === 'terminalGroup'
    )

    if (!groupNode) {
      return []
    }

    const delta = {
      x: change.position.x - groupNode.position.x,
      y: change.position.y - groupNode.position.y
    }

    if (delta.x === 0 && delta.y === 0) {
      return []
    }

    return [
      {
        memberBlockIds: new Set(groupNode.data.group.memberBlockIds),
        ...delta
      }
    ]
  })
}

function moveNodeByDelta<TNode extends WorkbenchFlowNode>(
  node: TNode,
  delta: TerminalGroupDragDelta
): TNode {
  return {
    ...node,
    position: {
      x: node.position.x + delta.x,
      y: node.position.y + delta.y
    }
  }
}

function resizeExpandedTerminalGroupShells(nodes: WorkbenchFlowNode[]): WorkbenchFlowNode[] {
  const terminalNodesById = new Map(
    nodes
      .filter((node): node is TerminalFlowNode => node.type === 'terminal')
      .map((node) => [node.id, node])
  )

  return nodes.map((node) => {
    if (node.type !== 'terminalGroup' || node.data.group.isCollapsed) {
      return node
    }

    const memberNodes = node.data.group.memberBlockIds.flatMap((blockId) => {
      const memberNode = terminalNodesById.get(blockId)

      return memberNode ? [memberNode] : []
    })

    if (memberNodes.length < 2) {
      return node
    }

    return resizeTerminalGroupShell(node, memberNodes)
  })
}

function resizeTerminalGroupShell(
  groupNode: TerminalGroupFlowNode,
  memberNodes: readonly TerminalFlowNode[]
): TerminalGroupFlowNode {
  const bounds = getTerminalNodeBounds(memberNodes)
  const currentWidth = resolveNodeDimension(groupNode, 'width')
  const currentHeight = resolveNodeDimension(groupNode, 'height')
  const currentRight = groupNode.position.x + currentWidth
  const currentBottom = groupNode.position.y + currentHeight
  const nextLeft = Math.min(groupNode.position.x, bounds.left - terminalGroupShellPadding.x)
  const nextTop = Math.min(groupNode.position.y, bounds.top - terminalGroupShellPadding.y)
  const nextWidth = Math.max(
    currentWidth,
    currentRight - nextLeft,
    bounds.right - nextLeft + terminalGroupShellPadding.x
  )
  const nextHeight = Math.max(
    currentHeight,
    currentBottom - nextTop,
    bounds.bottom - nextTop + terminalGroupShellPadding.y
  )

  if (
    nextLeft === groupNode.position.x &&
    nextTop === groupNode.position.y &&
    nextWidth === currentWidth &&
    nextHeight === currentHeight
  ) {
    return groupNode
  }

  return {
    ...groupNode,
    position: { x: nextLeft, y: nextTop },
    style: {
      ...groupNode.style,
      width: nextWidth,
      height: nextHeight
    }
  }
}

function getTerminalNodeBounds(memberNodes: readonly TerminalFlowNode[]) {
  return memberNodes.reduce(
    (bounds, node) => {
      const width = resolveNodeDimension(node, 'width')
      const height = resolveNodeDimension(node, 'height')

      return {
        left: Math.min(bounds.left, node.position.x),
        top: Math.min(bounds.top, node.position.y),
        right: Math.max(bounds.right, node.position.x + width),
        bottom: Math.max(bounds.bottom, node.position.y + height)
      }
    },
    {
      left: Number.POSITIVE_INFINITY,
      top: Number.POSITIVE_INFINITY,
      right: Number.NEGATIVE_INFINITY,
      bottom: Number.NEGATIVE_INFINITY
    }
  )
}

function resolveNodeDimension(
  node: TerminalFlowNode | TerminalGroupFlowNode,
  dimension: 'width' | 'height'
): number {
  const styleValue = node.style?.[dimension]

  if (typeof styleValue === 'number' && Number.isFinite(styleValue)) {
    return styleValue
  }

  const nodeValue = node[dimension]

  if (typeof nodeValue === 'number' && Number.isFinite(nodeValue)) {
    return nodeValue
  }

  const measuredValue = node.measured?.[dimension]

  if (typeof measuredValue === 'number' && Number.isFinite(measuredValue)) {
    return measuredValue
  }

  return node.type === 'terminal'
    ? node.data.block.size[dimension]
    : node.data.group.size[dimension]
}
