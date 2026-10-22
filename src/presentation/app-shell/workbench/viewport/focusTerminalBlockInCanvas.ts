import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { TerminalBlockSnapshot } from '../../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { readWorkbenchCanvasCreationGeometry } from './workbenchCanvasSafeViewport'
import { revealCreatedWorkbenchNode } from '../creation/revealCreatedWorkbenchNode'
import { scheduleWorkbenchNodeInputActivation } from '../creation/scheduleWorkbenchNodeInputActivation'
import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'
import { revealNavigatedWorkbenchNode } from './workbenchNavigationFocus'
import {
  activateWorkbenchNodeInput,
  createWorkbenchNodeInputSurfaceReadiness
} from '../creation/workbenchNodeInputActivation'
import type { WorkbenchViewportMotionIntent } from './workbenchViewportMotion'

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
  motion,
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
  const transitionCompletion =
    viewportIntent === 'creation'
      ? revealCreatedWorkbenchNode({
          ...readWorkbenchCanvasCreationGeometry(),
          nodePosition: position,
          nodeSize: { height: measuredHeight, width: measuredWidth },
          reactFlowInstance
        })
      : revealNavigatedWorkbenchNode({
          bounds: { ...position, height: measuredHeight, width: measuredWidth },
          motion,
          instance: reactFlowInstance,
          targetZoom
        })

  if (!activateTerminalInput) {
    return null
  }

  const focusTarget =
    node ??
    ({
      id: block.id,
      position,
      type: 'terminal'
    } as WorkbenchFlowNode)
  const inputReadiness =
    viewportIntent === 'creation' ? createWorkbenchNodeInputSurfaceReadiness(focusTarget) : null
  const readinessOptions = inputReadiness
    ? {
        isReady: inputReadiness.isReady,
        observeReadiness: inputReadiness.observe
      }
    : {}

  return scheduleWorkbenchNodeInputActivation({
    activate: () => activateWorkbenchNodeInput(focusTarget),
    ...readinessOptions,
    transitionCompletion
  })
}
