import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { TerminalBlockSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { readWorkbenchCanvasCreationGeometry } from './workbenchCanvasSafeViewport'
import { revealCreatedWorkbenchNode } from './revealCreatedWorkbenchNode'
import { scheduleWorkbenchNodeInputActivation } from './scheduleWorkbenchNodeInputActivation'
import type { WorkbenchFlowNode } from './types'
import { activateWorkbenchNodeInput } from './workbenchNodeInputActivation'
import {
  resolveWorkbenchViewportCommandTransition,
  transitionWorkbenchViewport,
  type WorkbenchViewportCommand,
  type WorkbenchViewportMotionIntent
} from './workbenchViewportMotion'

interface FocusTerminalBlockInCanvasInput {
  readonly block: TerminalBlockSnapshot
  readonly reactFlowInstance: ReactFlowInstance<WorkbenchFlowNode, Edge> | null
  readonly activateTerminalInput?: boolean
  readonly motion?: WorkbenchViewportMotionIntent
  readonly targetZoom?: number
  readonly viewportIntent?: 'creation' | 'navigation'
  readonly setSelectedTerminalBlockId: (blockId: string | null) => void
  readonly setHoveredTerminalBlockId: (blockId: string | null) => void
}

export function focusTerminalBlockInCanvas({
  block,
  reactFlowInstance,
  activateTerminalInput = true,
  motion = { type: 'spatial' },
  targetZoom,
  viewportIntent = 'navigation',
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
  const transitionDuration =
    viewportIntent === 'creation'
      ? revealCreatedWorkbenchNode({
          ...readWorkbenchCanvasCreationGeometry(),
          nodePosition: position,
          nodeSize: { height: measuredHeight, width: measuredWidth },
          reactFlowInstance
        })
      : revealNavigatedTerminalBlock({
          height: measuredHeight,
          motion,
          position,
          reactFlowInstance,
          targetZoom,
          width: measuredWidth
        })

  if (!activateTerminalInput) {
    return null
  }

  return scheduleWorkbenchNodeInputActivation({
    activate: () =>
      activateWorkbenchNodeInput(
        node ??
          ({
            id: block.id,
            position,
            type: 'terminal'
          } as WorkbenchFlowNode)
      ),
    transitionDuration
  })
}

function revealNavigatedTerminalBlock({
  height,
  motion,
  position,
  reactFlowInstance,
  targetZoom,
  width
}: {
  readonly height: number
  readonly motion: WorkbenchViewportMotionIntent
  readonly position: { readonly x: number; readonly y: number }
  readonly reactFlowInstance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly targetZoom?: number
  readonly width: number
}): number {
  const nextZoom = targetZoom ?? Math.max(reactFlowInstance.getZoom(), 0.9)
  const command = {
    center: { x: position.x + width / 2, y: position.y + height / 2 },
    intent: motion,
    type: 'center',
    zoom: nextZoom
  } satisfies WorkbenchViewportCommand
  const transitionDuration = resolveWorkbenchViewportCommandTransition(
    reactFlowInstance,
    command
  ).duration

  void transitionWorkbenchViewport(reactFlowInstance, command)

  return transitionDuration
}
