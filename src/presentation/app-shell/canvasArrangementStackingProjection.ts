import type {
  CanvasArrangementSnapshot,
  CanvasStackSnapshot
} from '../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { WorkbenchFlowNode } from './types'
import {
  canvasArrangementItemKey,
  type CanvasArrangementSelectionItem
} from './canvasArrangementSelection'

const stackZIndexBase = 100
const stackZIndexStride = 100
const objectZIndexStride = 10

export function projectCanvasArrangementStackingOntoNodes(
  arrangement: CanvasArrangementSnapshot | undefined,
  nodes: readonly WorkbenchFlowNode[]
): WorkbenchFlowNode[] {
  if (!arrangement || arrangement.stacks.length === 0) return [...nodes]

  const zIndexByNodeId = new Map<string, number>()
  const groupsById = new Map(
    nodes.filter((node) => node.type === 'terminalGroup').map((node) => [node.id, node] as const)
  )

  arrangement.stacks.forEach((stack, stackIndex) => {
    stack.items.forEach((item, itemIndex) => {
      const base = stackZIndexBase + stackIndex * stackZIndexStride + itemIndex * objectZIndexStride

      if (item.kind === 'terminal') {
        zIndexByNodeId.set(item.terminalId, base + 1)
        return
      }
      if (item.kind === 'workflow') {
        item.terminalIds.forEach((terminalId) => zIndexByNodeId.set(terminalId, base + 1))
        return
      }
      if (item.kind === 'agent') {
        zIndexByNodeId.set(`agent:${item.agentId}`, base + 1)
        return
      }

      zIndexByNodeId.set(item.terminalGroupId, base)
      groupsById
        .get(item.terminalGroupId)
        ?.data.group.memberBlockIds.forEach((terminalId) =>
          zIndexByNodeId.set(terminalId, base + 1)
        )
    })
  })

  return nodes.map((node) => {
    const zIndex = zIndexByNodeId.get(node.id)
    return zIndex === undefined ? node : ({ ...node, zIndex } as WorkbenchFlowNode)
  })
}

function findStackIdForCanvasNode(
  arrangement: CanvasArrangementSnapshot,
  nodeId: string,
  nodes: readonly WorkbenchFlowNode[]
): string | null {
  const group = nodes.find(
    (node) => node.type === 'terminalGroup' && node.data.group.memberBlockIds.includes(nodeId)
  )
  const keys = new Set<string>()
  keys.add(nodeId.startsWith('agent:') ? nodeId : `terminal:${nodeId}`)
  if (nodeId.startsWith('agent:')) keys.add(`agent:${nodeId.slice('agent:'.length)}`)
  if (group?.type === 'terminalGroup') keys.add(`combination:${group.id}`)
  keys.add(`combination:${nodeId}`)

  return (
    arrangement.stacks.find((stack) =>
      stack.items.some((item) => {
        if (item.kind === 'workflow') return item.terminalIds.includes(nodeId)
        return keys.has(canvasArrangementItemKey(item))
      })
    )?.id ?? null
  )
}

export interface CanvasStackDragTarget {
  readonly anchor: CanvasStackSnapshot['anchor']
  readonly items: readonly CanvasArrangementSelectionItem[]
  readonly nodeIds: readonly string[]
  readonly stackId: string
}

export function resolveCanvasStackDragTarget({
  arrangement,
  items,
  nodeId,
  nodes
}: {
  readonly arrangement: CanvasArrangementSnapshot
  readonly items: readonly CanvasArrangementSelectionItem[]
  readonly nodeId: string
  readonly nodes: readonly WorkbenchFlowNode[]
}): CanvasStackDragTarget | null {
  const stackId = findStackIdForCanvasNode(arrangement, nodeId, nodes)
  if (!stackId) return null

  const stack = arrangement.stacks.find((candidate) => candidate.id === stackId)
  if (!stack) return null
  const itemsByKey = new Map(items.map((item) => [item.key, item]))
  const stackItems = stack.items
    .map((item) => itemsByKey.get(canvasArrangementItemKey(item)))
    .filter((item): item is CanvasArrangementSelectionItem => Boolean(item))
  if (stackItems.length !== stack.items.length) return null

  const nodeIds = new Set(stackItems.flatMap((item) => [...item.nodeIds]))
  for (const item of stackItems) {
    if (item.reference.kind !== 'combination') continue
    const terminalGroupId = item.reference.terminalGroupId
    const groupNode = nodes.find(
      (node) => node.type === 'terminalGroup' && node.id === terminalGroupId
    )
    if (groupNode?.type === 'terminalGroup') {
      groupNode.data.group.memberBlockIds.forEach((memberId) => nodeIds.add(memberId))
    }
  }

  return { anchor: stack.anchor, items: stackItems, nodeIds: [...nodeIds], stackId }
}
