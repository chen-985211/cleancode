import type { TerminalSessionStatus } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { MinimapFlowNode, TerminalViewState } from './types'
import { getTerminalStatusColor } from './minimapInteraction'

interface TerminalMinimapAppearanceInput {
  readonly node: MinimapFlowNode
  readonly terminalStates: Record<string, TerminalViewState>
  readonly selectedTerminalBlockId: string | null
  readonly hoveredTerminalBlockId: string | null
}

export function getTerminalMiniMapNodeColor(
  node: MinimapFlowNode,
  terminalStates: Record<string, TerminalViewState>
): string {
  return getTerminalStatusColor(resolveMinimapNodeStatus(node, terminalStates))
}

export function getTerminalMiniMapNodeStrokeColor({
  node,
  selectedTerminalBlockId,
  hoveredTerminalBlockId
}: TerminalMinimapAppearanceInput): string {
  if (node.selected || selectedTerminalBlockId === node.id) {
    return '#34d399'
  }

  if (node.type === 'terminal' && hoveredTerminalBlockId === node.id) {
    return '#86efac'
  }

  return '#dbe3ef'
}

export function getTerminalMiniMapNodeClassName({
  node,
  terminalStates,
  selectedTerminalBlockId,
  hoveredTerminalBlockId
}: TerminalMinimapAppearanceInput): string {
  const status = resolveMinimapNodeStatus(node, terminalStates)

  return [
    'canvas-minimap__node',
    `canvas-minimap__node--${node.type}`,
    `canvas-minimap__node--${status}`,
    node.selected || selectedTerminalBlockId === node.id ? 'canvas-minimap__node--selected' : '',
    node.type === 'terminal' && hoveredTerminalBlockId === node.id
      ? 'canvas-minimap__node--highlighted'
      : ''
  ]
    .filter(Boolean)
    .join(' ')
}

function resolveMinimapNodeStatus(
  node: MinimapFlowNode,
  terminalStates: Record<string, TerminalViewState>
): TerminalSessionStatus {
  if (node.type === 'terminal') {
    return terminalStates[node.id]?.status ?? 'idle'
  }

  const memberStatuses = Object.values(node.data.memberStates).map((state) => state.status)

  if (memberStatuses.includes('failed')) {
    return 'failed'
  }

  if (memberStatuses.includes('running')) {
    return 'running'
  }

  if (memberStatuses.includes('exited')) {
    return 'exited'
  }

  return 'idle'
}
