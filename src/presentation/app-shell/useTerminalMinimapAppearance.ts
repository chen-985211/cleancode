import { useCallback } from 'react'

import type { MinimapFlowNode, TerminalViewState } from './types'
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
    (node: MinimapFlowNode): string => getTerminalMiniMapNodeColor(node, terminalStates),
    [terminalStates]
  )

  const getMiniMapNodeStrokeColor = useCallback(
    (node: MinimapFlowNode): string =>
      getTerminalMiniMapNodeStrokeColor({
        node,
        terminalStates,
        selectedTerminalBlockId,
        hoveredTerminalBlockId
      }),
    [hoveredTerminalBlockId, selectedTerminalBlockId, terminalStates]
  )

  const getMiniMapNodeClassName = useCallback(
    (node: MinimapFlowNode): string =>
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
