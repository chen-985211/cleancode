import { useCallback } from 'react'

import type { TerminalViewState } from '../../contexts/run/presentation/view-models/TerminalPresentationTypes'
import type { MinimapFlowNode } from './types/workbenchFlowNode'
import {
  getTerminalMiniMapNodeClassName,
  getTerminalMiniMapNodeColor,
  getTerminalMiniMapNodeStrokeColor
} from './projections/terminalMinimapAppearance'

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
