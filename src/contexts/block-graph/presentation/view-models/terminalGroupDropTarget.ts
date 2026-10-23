import type { BlockGraphSnapshot } from '../../application/dto/BlockGraphSnapshot'
import type { TerminalGroupDropFeedback } from './TerminalGroupPresentationTypes'

export type TerminalGroupDropAction =
  | {
      readonly type: 'join-group'
      readonly terminalGroupId: string
    }
  | {
      readonly type: 'leave-group'
      readonly terminalGroupId: string
    }
  | {
      readonly type: 'none'
    }

interface TerminalGroupDropNode {
  readonly id: string
  readonly type?: string
  readonly position: { readonly x: number; readonly y: number }
  readonly width?: number
  readonly height?: number
  readonly measured?: { readonly width?: number; readonly height?: number }
  readonly style?: { readonly width?: number | string; readonly height?: number | string }
  readonly data: Readonly<Record<string, unknown>>
}

interface ResolveTerminalGroupDropActionInput {
  readonly graph: BlockGraphSnapshot
  readonly draggedNode: TerminalGroupDropNode
  readonly editingTerminalGroupId?: string
  readonly nodes: readonly TerminalGroupDropNode[]
  readonly previousAction?: TerminalGroupDropAction
  readonly point?: { readonly x: number; readonly y: number }
}

export function resolveTerminalGroupDropAction({
  graph,
  draggedNode,
  editingTerminalGroupId,
  nodes,
  previousAction = { type: 'none' },
  point
}: ResolveTerminalGroupDropActionInput): TerminalGroupDropAction {
  const terminalCenter = point ?? getNodeCenter(draggedNode)
  const currentGroup = graph.terminalGroups.find((group) =>
    group.memberBlockIds.includes(draggedNode.id)
  )
  const groupNodes = nodes.filter((node) => node.type === 'terminalGroup')
  // The caller supplies the immutable rectangles captured at drag start.
  // Enter 12 units inside; stay accepted until 12 units outside the same boundary.
  const targetGroupNode = groupNodes.find((node) => {
    if (node.id === currentGroup?.id) return false
    if (editingTerminalGroupId && node.id !== editingTerminalGroupId) return false
    const wasTarget =
      previousAction.type === 'join-group' && previousAction.terminalGroupId === node.id
    return isPointInsideNode(terminalCenter, node, wasTarget ? 12 : -12)
  })
  if (targetGroupNode) return { type: 'join-group', terminalGroupId: targetGroupNode.id }
  if (!currentGroup) return { type: 'none' }
  const currentNode = groupNodes.find((node) => node.id === currentGroup.id)
  const wasLeaving = previousAction.type === 'leave-group'
  const isInside = currentNode
    ? isPointInsideNode(terminalCenter, currentNode, wasLeaving ? -12 : 12)
    : isPointInsideRect(terminalCenter, currentGroup.position, currentGroup.size)
  return isInside ? { type: 'none' } : { type: 'leave-group', terminalGroupId: currentGroup.id }
}

export function resolveTerminalGroupDropFeedback(
  terminalGroupId: string,
  action: TerminalGroupDropAction
): TerminalGroupDropFeedback | null {
  if (action.type === 'join-group' && action.terminalGroupId === terminalGroupId) {
    return 'join'
  }

  if (action.type === 'leave-group' && action.terminalGroupId === terminalGroupId) {
    return 'leave'
  }

  return null
}

export function isSameTerminalGroupDropAction(
  left: TerminalGroupDropAction,
  right: TerminalGroupDropAction
): boolean {
  if (left.type !== right.type) return false
  if (left.type === 'none' && right.type === 'none') return true
  if (left.type === 'join-group' && right.type === 'join-group') {
    return left.terminalGroupId === right.terminalGroupId
  }

  return (
    left.type === 'leave-group' &&
    right.type === 'leave-group' &&
    left.terminalGroupId === right.terminalGroupId
  )
}

function isPointInsideRect(
  point: { readonly x: number; readonly y: number },
  position: { readonly x: number; readonly y: number },
  size: { readonly width: number; readonly height: number }
): boolean {
  return (
    point.x >= position.x &&
    point.x <= position.x + size.width &&
    point.y >= position.y &&
    point.y <= position.y + size.height
  )
}

function getNodeCenter(node: TerminalGroupDropNode): { readonly x: number; readonly y: number } {
  return {
    x: node.position.x + resolveNodeDimension(node, 'width') / 2,
    y: node.position.y + resolveNodeDimension(node, 'height') / 2
  }
}

function isPointInsideNode(
  point: { readonly x: number; readonly y: number },
  node: TerminalGroupDropNode,
  margin = 0
): boolean {
  return isPointInsideRect(
    point,
    { x: node.position.x - margin, y: node.position.y - margin },
    {
      width: resolveNodeDimension(node, 'width') + margin * 2,
      height: resolveNodeDimension(node, 'height') + margin * 2
    }
  )
}

function resolveNodeDimension(node: TerminalGroupDropNode, dimension: 'width' | 'height'): number {
  const styleValue = node.style?.[dimension]
  if (typeof styleValue === 'number' && Number.isFinite(styleValue)) return styleValue

  const nodeValue = node[dimension]
  if (typeof nodeValue === 'number' && Number.isFinite(nodeValue)) return nodeValue

  const measuredValue = node.measured?.[dimension]
  if (typeof measuredValue === 'number' && Number.isFinite(measuredValue)) return measuredValue

  const data = node.data as {
    readonly block?: { readonly size: { readonly width: number; readonly height: number } }
    readonly group?: { readonly size: { readonly width: number; readonly height: number } }
  }
  return data.block?.size[dimension] ?? data.group?.size[dimension] ?? 0
}
