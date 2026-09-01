import type {
  CanvasArrangementItemReference,
  CanvasArrangementSnapshot,
  CanvasStackSnapshot
} from '../../application/dto/CanvasArrangementSnapshot'
import {
  canvasArrangementItemKey,
  type CanvasArrangementSelectionItem
} from './canvasArrangementSelection'

const stackZIndexBase = 100
const stackZIndexStride = 100
const objectZIndexStride = 10

type CanvasArrangementProjectionReference = Exclude<
  CanvasArrangementItemReference,
  { readonly kind: 'workflow' }
>

export interface CanvasArrangementProjectionNode {
  readonly id: string
  readonly memberNodeIds?: readonly string[]
  readonly reference: CanvasArrangementProjectionReference
}

export function createCanvasArrangementStackingZIndexProjection(
  arrangement: CanvasArrangementSnapshot | undefined,
  nodes: readonly CanvasArrangementProjectionNode[]
): ReadonlyMap<string, number> {
  const zIndexByNodeId = new Map<string, number>()
  if (!arrangement) return zIndexByNodeId

  arrangement.stacks.forEach((stack, stackIndex) => {
    stack.items.forEach((item, itemIndex) => {
      const base = stackZIndexBase + stackIndex * stackZIndexStride + itemIndex * objectZIndexStride

      if (item.kind === 'workflow') {
        nodes
          .filter(
            (node) =>
              node.reference.kind === 'terminal' &&
              item.terminalIds.includes(node.reference.terminalId)
          )
          .forEach((node) => zIndexByNodeId.set(node.id, base + 1))
        return
      }

      const node = nodes.find(
        (candidate) =>
          canvasArrangementItemKey(candidate.reference) === canvasArrangementItemKey(item)
      )
      if (!node) return
      zIndexByNodeId.set(node.id, item.kind === 'combination' ? base : base + 1)
      if (item.kind === 'combination') {
        node.memberNodeIds?.forEach((memberNodeId) => zIndexByNodeId.set(memberNodeId, base + 1))
      }
    })
  })

  return zIndexByNodeId
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
  readonly nodes: readonly CanvasArrangementProjectionNode[]
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
    nodes
      .find(
        (node) =>
          node.reference.kind === 'combination' &&
          node.reference.terminalGroupId === terminalGroupId
      )
      ?.memberNodeIds?.forEach((memberId) => nodeIds.add(memberId))
  }

  return { anchor: stack.anchor, items: stackItems, nodeIds: [...nodeIds], stackId }
}

function findStackIdForCanvasNode(
  arrangement: CanvasArrangementSnapshot,
  nodeId: string,
  nodes: readonly CanvasArrangementProjectionNode[]
): string | null {
  const node = nodes.find((candidate) => candidate.id === nodeId)
  const owningCombination = nodes.find(
    (candidate) =>
      candidate.reference.kind === 'combination' && candidate.memberNodeIds?.includes(nodeId)
  )
  const keys = new Set<string>()
  if (node) keys.add(canvasArrangementItemKey(node.reference))
  if (owningCombination) keys.add(canvasArrangementItemKey(owningCombination.reference))

  return (
    arrangement.stacks.find((stack) =>
      stack.items.some((item) => {
        if (item.kind === 'workflow') {
          return node?.reference.kind === 'terminal'
            ? item.terminalIds.includes(node.reference.terminalId)
            : false
        }
        return keys.has(canvasArrangementItemKey(item))
      })
    )?.id ?? null
  )
}
