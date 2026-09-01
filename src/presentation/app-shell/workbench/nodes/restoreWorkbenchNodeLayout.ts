import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../../types/workbenchSnapshot'

export function restoreWorkbenchNodeLayout(
  nodes: WorkbenchFlowNode[],
  graph: WorkbenchSnapshot['graph'] | null,
  failedNode: WorkbenchFlowNode
): WorkbenchFlowNode[] {
  const currentDraggedNode = nodes.find((node) => node.id === failedNode.id)

  if (!currentDraggedNode || !isSamePosition(currentDraggedNode.position, failedNode.position)) {
    return nodes
  }

  const affectedTerminalIds = resolveAffectedTerminalIds(graph, failedNode)
  const affectedGroupIds = resolveAffectedTerminalGroupIds(graph, failedNode)
  let didChange = false
  const restoredNodes = nodes.map((node): WorkbenchFlowNode => {
    if (graph && node.type === 'terminal' && affectedTerminalIds.has(node.id)) {
      const block = graph.blocks.find((candidate) => candidate.id === node.id)

      if (!block || hasLayout(node, block.position, block.size)) return node

      didChange = true
      return {
        ...node,
        position: block.position,
        style: { ...node.style, width: block.size.width, height: block.size.height }
      }
    }

    if (graph && node.type === 'terminalGroup' && affectedGroupIds.has(node.id)) {
      const group = graph.terminalGroups.find((candidate) => candidate.id === node.id)
      const size = group?.isCollapsed ? undefined : group?.size

      if (!group || hasLayout(node, group.position, size)) return node

      didChange = true
      return {
        ...node,
        position: group.position,
        style: size ? { ...node.style, width: size.width, height: size.height } : node.style
      }
    }

    if (node.type === 'agentConsole' && node.id === failedNode.id) {
      const layout = node.data.agent.layout

      if (hasLayout(node, layout.position, layout.size)) return node

      didChange = true
      return {
        ...node,
        position: layout.position,
        style: { ...node.style, width: layout.size.width, height: layout.size.height }
      }
    }

    return node
  })

  return didChange ? restoredNodes : nodes
}

function resolveAffectedTerminalIds(
  graph: WorkbenchSnapshot['graph'] | null,
  failedNode: WorkbenchFlowNode
): ReadonlySet<string> {
  if (!graph) return new Set()
  if (failedNode.type === 'terminal') return new Set([failedNode.id])
  if (failedNode.type !== 'terminalGroup') return new Set()

  return new Set(
    graph.terminalGroups.find((group) => group.id === failedNode.id)?.memberBlockIds ?? []
  )
}

function resolveAffectedTerminalGroupIds(
  graph: WorkbenchSnapshot['graph'] | null,
  failedNode: WorkbenchFlowNode
): ReadonlySet<string> {
  if (!graph) return new Set()
  if (failedNode.type === 'terminalGroup') return new Set([failedNode.id])
  if (failedNode.type !== 'terminal') return new Set()

  const group = graph.terminalGroups.find((candidate) =>
    candidate.memberBlockIds.includes(failedNode.id)
  )

  return new Set(group ? [group.id] : [])
}

function hasLayout(
  node: WorkbenchFlowNode,
  position: { readonly x: number; readonly y: number },
  size?: { readonly width: number; readonly height: number }
): boolean {
  return (
    isSamePosition(node.position, position) &&
    (!size || (node.style?.width === size.width && node.style?.height === size.height))
  )
}

function isSamePosition(
  left: { readonly x: number; readonly y: number },
  right: { readonly x: number; readonly y: number }
): boolean {
  return left.x === right.x && left.y === right.y
}
