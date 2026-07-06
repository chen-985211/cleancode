import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalFlowNode } from './types'

interface FocusTerminalBlockInCanvasInput {
  readonly block: TerminalBlockSnapshot
  readonly reactFlowInstance: ReactFlowInstance<TerminalFlowNode, Edge> | null
  readonly duration?: number
  readonly setSelectedTerminalBlockId: (blockId: string | null) => void
  readonly setHoveredTerminalBlockId: (blockId: string | null) => void
}

export function focusTerminalBlockInCanvas({
  block,
  reactFlowInstance,
  duration = 220,
  setSelectedTerminalBlockId,
  setHoveredTerminalBlockId
}: FocusTerminalBlockInCanvasInput): void {
  setSelectedTerminalBlockId(block.id)
  setHoveredTerminalBlockId(null)

  if (!reactFlowInstance) {
    return
  }

  const node = reactFlowInstance.getNode(block.id)
  const measuredWidth = node?.measured?.width ?? block.size.width
  const measuredHeight = node?.measured?.height ?? block.size.height
  const position = node?.position ?? block.position
  const nextZoom = Math.max(reactFlowInstance.getZoom(), 0.9)

  void reactFlowInstance.setCenter(
    position.x + measuredWidth / 2,
    position.y + measuredHeight / 2,
    {
      zoom: nextZoom,
      duration
    }
  )
  window.setTimeout(() => {
    document
      .querySelector<HTMLElement>(`[data-terminal-block-id="${block.id}"] .terminal-viewport`)
      ?.focus()
  }, duration + 20)
}
