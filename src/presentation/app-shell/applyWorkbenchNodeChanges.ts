import { applyNodeChanges, type NodeChange } from '@xyflow/react'

import type { TerminalGroupFlowNode, WorkbenchFlowNode } from './types'

export function applyWorkbenchNodeChanges(
  changes: NodeChange<WorkbenchFlowNode>[],
  nodes: WorkbenchFlowNode[]
): WorkbenchFlowNode[] {
  const groupDeltas = collectTerminalGroupDragDeltas(changes, nodes)
  const changedNodes = applyNodeChanges(changes, nodes)

  if (groupDeltas.length === 0) {
    return changedNodes
  }

  return changedNodes.map((node) => {
    if (node.type !== 'terminal') {
      return node
    }

    const delta = groupDeltas.find((entry) => entry.memberBlockIds.has(node.id))

    return delta ? moveNodeByDelta(node, delta) : node
  })
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
