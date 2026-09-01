import type { QuickExecutionTargetSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { resolveCanvasObjectContextTarget } from './canvasObjectContextTarget'
import { toQuickExecutionTarget } from '../../contexts/block-graph/presentation/view-models/quickExecutionProjection'
import type { WorkbenchFlowNode } from './types/workbenchFlowNode'
import type { WorkbenchSnapshot } from './types/workbenchSnapshot'

export function resolveTerminalCreationGroupId(
  graph: WorkbenchSnapshot['graph'] | null,
  editingTerminalGroupId: string | null,
  position: { readonly x: number; readonly y: number }
): string | undefined {
  if (!graph || !editingTerminalGroupId) return undefined
  const group = graph.terminalGroups.find((candidate) => candidate.id === editingTerminalGroupId)
  if (!group) return undefined

  return position.x >= group.position.x &&
    position.x <= group.position.x + group.size.width &&
    position.y >= group.position.y &&
    position.y <= group.position.y + group.size.height
    ? group.id
    : undefined
}

export function toWorkbenchFlowPosition(
  instance: {
    readonly screenToFlowPosition?: (position: { x: number; y: number }) => {
      x: number
      y: number
    }
  } | null,
  screenPosition: { readonly x: number; readonly y: number }
): { readonly x: number; readonly y: number } {
  const position = instance?.screenToFlowPosition?.(screenPosition) ?? screenPosition
  return { x: position.x, y: position.y }
}

export function resolveQuickExecutionNodeTarget(
  graph: WorkbenchSnapshot['graph'] | null,
  node: WorkbenchFlowNode
): QuickExecutionTargetSnapshot | null {
  if (!graph || node.type === 'agentConsole') return null

  const contextTarget = resolveCanvasObjectContextTarget(graph, {
    nodeId: node.id,
    nodeType: node.type === 'terminalGroup' ? 'terminalGroup' : 'terminal'
  })

  return contextTarget && contextTarget.kind !== 'agent'
    ? toQuickExecutionTarget(contextTarget)
    : null
}

export function resolveQuickExecutionDropTarget(
  surface: HTMLElement | null,
  event: globalThis.MouseEvent | TouchEvent
): boolean {
  const point = readClientPoint(event)
  const bar = surface?.querySelector<HTMLElement>('[data-quick-execution-bar]')
  if (!bar || !point) return false

  const rect = bar.getBoundingClientRect()
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  )
}

function readClientPoint(
  event: globalThis.MouseEvent | TouchEvent
): { readonly x: number; readonly y: number } | null {
  if ('clientX' in event) return { x: event.clientX, y: event.clientY }
  if (!('changedTouches' in event) || !('touches' in event)) return null

  const touch = event.changedTouches[0] ?? event.touches[0]
  return touch ? { x: touch.clientX, y: touch.clientY } : null
}
