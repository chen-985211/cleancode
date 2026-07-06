import type { TerminalFlowNode, TerminalViewState } from './types'
import { getTerminalStatusColor } from './minimapInteraction'

interface TerminalMinimapAppearanceInput {
  readonly node: TerminalFlowNode
  readonly terminalStates: Record<string, TerminalViewState>
  readonly selectedTerminalBlockId: string | null
  readonly hoveredTerminalBlockId: string | null
}

export function getTerminalMiniMapNodeColor(
  node: TerminalFlowNode,
  terminalStates: Record<string, TerminalViewState>
): string {
  return getTerminalStatusColor(terminalStates[node.id]?.status ?? 'idle')
}

export function getTerminalMiniMapNodeStrokeColor({
  node,
  terminalStates,
  selectedTerminalBlockId,
  hoveredTerminalBlockId
}: TerminalMinimapAppearanceInput): string {
  if (selectedTerminalBlockId === node.id) {
    return '#2563eb'
  }

  if (hoveredTerminalBlockId === node.id) {
    return '#8fa9f7'
  }

  return terminalStates[node.id]?.status === 'running' ? '#22c55e' : '#d3dbe8'
}

export function getTerminalMiniMapNodeClassName({
  node,
  terminalStates,
  selectedTerminalBlockId,
  hoveredTerminalBlockId
}: TerminalMinimapAppearanceInput): string {
  return [
    'canvas-minimap__node',
    `canvas-minimap__node--${terminalStates[node.id]?.status ?? 'idle'}`,
    selectedTerminalBlockId === node.id ? 'canvas-minimap__node--selected' : '',
    hoveredTerminalBlockId === node.id ? 'canvas-minimap__node--highlighted' : ''
  ]
    .filter(Boolean)
    .join(' ')
}
