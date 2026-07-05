import { useCallback } from 'react'

import type { TerminalFlowNode, TerminalViewState } from './types'
import {
  getTerminalMiniMapNodeClassName,
  getTerminalMiniMapNodeColor,
  getTerminalMiniMapNodeStrokeColor
} from './terminalMinimapAppearance'

interface TerminalMinimapAppearanceInput {
  readonly terminalStates: Record<string, TerminalViewState>
  readonly selectedTerminalBlockId: string | null
  readonly hoveredTerminalBlockId: string | null
}

export function useTerminalMinimapAppearance({
  terminalStates,
  selectedTerminalBlockId,
  hoveredTerminalBlockId
}: TerminalMinimapAppearanceInput) {
  const getMiniMapNodeColor = useCallback(
    (node: TerminalFlowNode): string => getTerminalMiniMapNodeColor(node, terminalStates),
    [terminalStates]
  )

  const getMiniMapNodeStrokeColor = useCallback(
    (node: TerminalFlowNode): string =>
      getTerminalMiniMapNodeStrokeColor({
        node,
        terminalStates,
        selectedTerminalBlockId,
        hoveredTerminalBlockId
      }),
    [hoveredTerminalBlockId, selectedTerminalBlockId, terminalStates]
  )

  const getMiniMapNodeClassName = useCallback(
    (node: TerminalFlowNode): string =>
      getTerminalMiniMapNodeClassName({
        node,
        terminalStates,
        selectedTerminalBlockId,
        hoveredTerminalBlockId
      }),
    [hoveredTerminalBlockId, selectedTerminalBlockId, terminalStates]
  )

  return {
    getMiniMapNodeColor,
    getMiniMapNodeStrokeColor,
    getMiniMapNodeClassName
  }
}
