import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchFlowNode } from './types'

interface FocusTerminalBlockInCanvasInput {
  readonly block: TerminalBlockSnapshot
  readonly reactFlowInstance: ReactFlowInstance<WorkbenchFlowNode, Edge> | null
  readonly duration?: number
  readonly interpolate?: 'smooth' | 'linear'
  readonly setSelectedTerminalBlockId: (blockId: string | null) => void
  readonly setHoveredTerminalBlockId: (blockId: string | null) => void
}

export function focusTerminalBlockInCanvas({
  block,
  reactFlowInstance,
  duration = 220,
  interpolate,
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
      duration,
      ...(interpolate ? { interpolate } : {})
    }
  )
  window.setTimeout(() => {
    const terminalNode = document.querySelector<HTMLElement>(
      `[data-terminal-block-id="${block.id}"]`
    )

    terminalNode?.querySelector<HTMLElement>('.terminal-viewport')?.focus()
    terminalNode?.querySelector<HTMLElement>('.xterm-helper-textarea')?.focus()
  }, duration + 20)
}
