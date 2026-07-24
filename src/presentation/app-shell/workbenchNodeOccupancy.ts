import { resolveWorkbenchNodeSize } from './workbenchNodeFocusViewport'
import type { WorkbenchFlowNode } from './types'
import type { WorkbenchCanvasRect } from './workbenchNodeCreationPolicy'

export function createWorkbenchNodeOccupancy(
  nodes: readonly WorkbenchFlowNode[]
): WorkbenchCanvasRect[] {
  const groupedTerminalIds = new Set(
    nodes.flatMap((node) =>
      node.type === 'terminalGroup' ? [...node.data.group.memberBlockIds] : []
    )
  )

  return nodes
    .filter(
      (node) =>
        node.type === 'agentConsole' ||
        node.type === 'terminalGroup' ||
        (node.type === 'terminal' && !groupedTerminalIds.has(node.id))
    )
    .map((node) => ({
      id: node.id,
      position: { ...node.position },
      size: resolveWorkbenchNodeSize(node)
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}
