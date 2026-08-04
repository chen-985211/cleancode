import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { WorkbenchFlowNode } from './types'
import type {
  WorkbenchNodePosition,
  WorkbenchNodeSize,
  WorkbenchScreenRect
} from './workbenchNodeCreationPolicy'
import { resolveWorkbenchNodeCreationViewport } from './workbenchNodeCreationPolicy'
import {
  resolveWorkbenchViewportCommandTransition,
  transitionWorkbenchViewport,
  type WorkbenchViewportCommand
} from './workbenchViewportMotion'

interface RevealCreatedWorkbenchNodeInput {
  readonly canvasSize: WorkbenchNodeSize
  readonly nodePosition: WorkbenchNodePosition
  readonly nodeSize: WorkbenchNodeSize
  readonly reactFlowInstance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly safeViewport: WorkbenchScreenRect
}

export function revealCreatedWorkbenchNode({
  canvasSize,
  nodePosition,
  nodeSize,
  reactFlowInstance,
  safeViewport
}: RevealCreatedWorkbenchNodeInput): number {
  const command = {
    intent: { path: 'direct', type: 'spatial' },
    type: 'set-viewport',
    viewport: resolveWorkbenchNodeCreationViewport({
      canvasSize,
      nodePosition,
      nodeSize,
      safeViewport
    })
  } satisfies WorkbenchViewportCommand
  const transitionDuration = resolveWorkbenchViewportCommandTransition(
    reactFlowInstance,
    command
  ).duration

  void transitionWorkbenchViewport(reactFlowInstance, command)

  return transitionDuration
}
