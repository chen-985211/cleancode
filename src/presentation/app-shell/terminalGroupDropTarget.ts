import type {
  TerminalFlowNode,
  TerminalGroupDropFeedback,
  TerminalGroupFlowNode,
  WorkbenchFlowNode,
  WorkbenchSnapshot
} from './types'

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

interface ResolveTerminalGroupDropActionInput {
  readonly graph: WorkbenchSnapshot['graph']
  readonly draggedNode: TerminalFlowNode
  readonly editingTerminalGroupId?: string
  readonly nodes: readonly WorkbenchFlowNode[]
}

export function resolveTerminalGroupDropAction({
  graph,
  draggedNode,
  editingTerminalGroupId,
  nodes
}: ResolveTerminalGroupDropActionInput): TerminalGroupDropAction {
  const terminalCenter = getNodeCenter(draggedNode)
  const currentGroup = graph.terminalGroups.find((group) =>
    group.memberBlockIds.includes(draggedNode.id)
  )
  const groupNodes = nodes.filter(
    (node): node is TerminalGroupFlowNode => node.type === 'terminalGroup'
  )
  const activeGroupId = editingTerminalGroupId ?? currentGroup?.id ?? groupNodes[0]?.id
  if (!activeGroupId) return { type: 'none' }

  if (currentGroup?.id === activeGroupId) {
    if (isPointInsideRect(terminalCenter, currentGroup.position, currentGroup.size)) {
      return { type: 'none' }
    }

    return {
      type: 'leave-group',
      terminalGroupId: currentGroup.id
    }
  }

  const targetGroupNode = groupNodes.find(
    (groupNode) => groupNode.id === activeGroupId && isPointInsideNode(terminalCenter, groupNode)
  )

  return targetGroupNode
    ? { type: 'join-group', terminalGroupId: targetGroupNode.id }
    : { type: 'none' }
}

export function projectTerminalGroupDropAction(
  nodes: WorkbenchFlowNode[],
  action: TerminalGroupDropAction
): WorkbenchFlowNode[] {
  let didChange = false
  const nextNodes = nodes.map((node): WorkbenchFlowNode => {
    if (node.type !== 'terminalGroup') return node

    const dropFeedback = resolveTerminalGroupDropFeedback(node.id, action)

    if (node.data.dropFeedback === dropFeedback) return node

    didChange = true
    return { ...node, data: { ...node.data, dropFeedback } }
  })

  return didChange ? nextNodes : nodes
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

function getNodeCenter(node: TerminalFlowNode): { readonly x: number; readonly y: number } {
  const width = resolveNodeDimension(node, 'width')
  const height = resolveNodeDimension(node, 'height')

  return {
    x: node.position.x + width / 2,
    y: node.position.y + height / 2
  }
}

function isPointInsideNode(
  point: { readonly x: number; readonly y: number },
  node: TerminalGroupFlowNode
): boolean {
  const width = resolveNodeDimension(node, 'width')
  const height = resolveNodeDimension(node, 'height')

  return (
    point.x >= node.position.x &&
    point.x <= node.position.x + width &&
    point.y >= node.position.y &&
    point.y <= node.position.y + height
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
