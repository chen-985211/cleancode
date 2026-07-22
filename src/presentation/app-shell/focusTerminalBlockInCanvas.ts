import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchFlowNode } from './types'

interface FocusTerminalBlockInCanvasInput {
  readonly block: TerminalBlockSnapshot
  readonly reactFlowInstance: ReactFlowInstance<WorkbenchFlowNode, Edge> | null
  readonly activateTerminalInput?: boolean
  readonly duration?: number
  readonly interpolate?: 'smooth' | 'linear'
  readonly targetZoom?: number
  readonly setSelectedTerminalBlockId: (blockId: string | null) => void
  readonly setHoveredTerminalBlockId: (blockId: string | null) => void
}

export function focusTerminalBlockInCanvas({
  block,
  reactFlowInstance,
  activateTerminalInput = true,
  duration = 220,
  interpolate,
  targetZoom,
  setSelectedTerminalBlockId,
  setHoveredTerminalBlockId
}: FocusTerminalBlockInCanvasInput): (() => void) | null {
  setSelectedTerminalBlockId(block.id)
  setHoveredTerminalBlockId(null)

  if (!reactFlowInstance) {
    return null
  }

  const node = reactFlowInstance.getNode(block.id)
  const measuredWidth = node?.measured?.width ?? block.size.width
  const measuredHeight = node?.measured?.height ?? block.size.height
  const position = node?.position ?? block.position
  const nextZoom = targetZoom ?? Math.max(reactFlowInstance.getZoom(), 0.9)

  void reactFlowInstance.setCenter(
    position.x + measuredWidth / 2,
    position.y + measuredHeight / 2,
    {
      zoom: nextZoom,
      duration,
      ...(interpolate ? { interpolate } : {})
    }
  )

  if (!activateTerminalInput) {
    return null
  }

  let isPending = true
  const timeoutId = window.setTimeout(() => {
    isPending = false
    const terminalNode = document.querySelector<HTMLElement>(
      `[data-terminal-block-id="${block.id}"]`
    )

    terminalNode?.querySelector<HTMLElement>('.terminal-viewport')?.focus()
    terminalNode?.querySelector<HTMLElement>('.xterm-helper-textarea')?.focus()
  }, duration + 20)

  return () => {
    if (!isPending) {
      return
    }

    isPending = false
    window.clearTimeout(timeoutId)
  }
}
