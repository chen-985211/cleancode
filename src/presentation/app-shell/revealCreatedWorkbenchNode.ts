import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { WorkbenchFlowNode } from './types'
import type {
  WorkbenchNodePosition,
  WorkbenchNodeSize,
  WorkbenchScreenRect
} from './workbenchNodeCreationPolicy'
import { resolveWorkbenchNodeCreationViewport } from './workbenchNodeCreationPolicy'
import { prefersReducedMotion } from './workbenchFocusTransition'

interface RevealCreatedWorkbenchNodeInput {
  readonly canvasSize: WorkbenchNodeSize
  readonly duration: number
  readonly nodePosition: WorkbenchNodePosition
  readonly nodeSize: WorkbenchNodeSize
  readonly reactFlowInstance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly safeViewport: WorkbenchScreenRect
}

export function revealCreatedWorkbenchNode({
  canvasSize,
  duration,
  nodePosition,
  nodeSize,
  reactFlowInstance,
  safeViewport
}: RevealCreatedWorkbenchNodeInput): number {
  const transitionDuration = prefersReducedMotion() ? 0 : duration

  void reactFlowInstance.setViewport(
    resolveWorkbenchNodeCreationViewport({
      canvasSize,
      nodePosition,
      nodeSize,
      safeViewport
    }),
    {
      duration: transitionDuration,
      interpolate: 'linear'
    }
  )

  return transitionDuration
}
