import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'

type Point = { readonly x: number; readonly y: number }
export function captureWorkbenchNodePresentation(
  node: WorkbenchFlowNode,
  toFlow: (point: Point) => Point
): WorkbenchFlowNode {
  const root = document.querySelector(`[data-id="${CSS.escape(node.id)}"].react-flow__node`)
  const bounds = root
    ?.querySelector('.terminal-group-node__material, .terminal-node, .agent-console-node')
    ?.getBoundingClientRect()
  if (!bounds?.width || !bounds.height || node.data.isParkedInCollapsedGroup) return node
  const position = toFlow({ x: bounds.left, y: bounds.top })
  const end = toFlow({ x: bounds.right, y: bounds.bottom })
  return {
    ...node,
    position,
    style: { ...node.style, width: end.x - position.x, height: end.y - position.y }
  }
}
