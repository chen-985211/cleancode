import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'
import type { MutableRefObject } from 'react'

import type { MinimapViewportCenter } from './CanvasMinimap'
import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import {
  transitionWorkbenchViewport,
  type WorkbenchViewportMotionCompletion
} from './workbenchViewportMotion'

interface CanvasViewportProjection {
  readonly setViewportZoom: (zoom: number) => void
  readonly setCanvasViewport: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
}

interface CanvasViewportPersistence {
  readonly onViewportChange: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
}

interface SynchronizeCanvasViewportFromMoveInput extends CanvasViewportProjection {
  readonly event: unknown
  readonly viewport: Viewport
}

export function synchronizeCanvasViewportFromMove({
  event,
  viewport,
  setViewportZoom,
  setCanvasViewport
}: SynchronizeCanvasViewportFromMoveInput): void {
  if (!event) {
    return
  }

  const canvasViewport = toCanvasViewportSnapshot(viewport)
  setViewportZoom(canvasViewport.zoom)
  setCanvasViewport(canvasViewport)
}

interface PersistCanvasViewportFromMoveEndInput extends CanvasViewportPersistence {
  readonly event: unknown
  readonly isRestoringViewport: boolean
  readonly viewport: Viewport
}

export function persistCanvasViewportFromMoveEnd({
  event,
  isRestoringViewport,
  viewport,
  onViewportChange
}: PersistCanvasViewportFromMoveEndInput): void {
  if (!event || isRestoringViewport) {
    return
  }

  onViewportChange(toCanvasViewportSnapshot(viewport))
}

interface CommitCompletedCanvasViewportMotionInput
  extends CanvasViewportProjection, CanvasViewportPersistence {
  readonly completion: WorkbenchViewportMotionCompletion
}

export function commitCompletedCanvasViewportMotion({
  completion,
  onViewportChange,
  setViewportZoom,
  setCanvasViewport
}: CommitCompletedCanvasViewportMotionInput): void {
  if (completion.intent.type === 'instant') {
    return
  }

  const canvasViewport = toCanvasViewportSnapshot(completion.viewport)
  setViewportZoom(canvasViewport.zoom)
  setCanvasViewport(canvasViewport)
  onViewportChange(canvasViewport)
}

interface RestoreCanvasViewportInput {
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly viewport: WorkbenchSnapshot['graph']['viewport']
  readonly graphId: string
  readonly restoredGraphIdRef: MutableRefObject<string | null>
  readonly isRestoringViewportRef: MutableRefObject<boolean>
  readonly setViewportZoom: (zoom: number) => void
  readonly setCanvasViewport: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
}

export function restoreCanvasViewport({
  instance,
  viewport,
  graphId,
  restoredGraphIdRef,
  isRestoringViewportRef,
  setViewportZoom,
  setCanvasViewport
}: RestoreCanvasViewportInput): void {
  restoredGraphIdRef.current = graphId
  isRestoringViewportRef.current = true
  setViewportZoom(viewport.zoom)
  setCanvasViewport(viewport)

  void transitionWorkbenchViewport(instance, {
    intent: { type: 'instant' },
    type: 'set-viewport',
    viewport
  }).finally(() => {
    window.setTimeout(() => {
      isRestoringViewportRef.current = false
    }, 0)
  })
}

export function toCanvasViewportSnapshot(
  viewport: Viewport
): WorkbenchSnapshot['graph']['viewport'] {
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: viewport.zoom
  }
}

interface CenterCanvasViewportOnMinimapPointInput {
  readonly center: MinimapViewportCenter
  readonly canvasSize: { readonly width: number; readonly height: number }
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly persistViewport: boolean
  readonly onViewportChange: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
  readonly setCanvasViewport: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
  readonly setViewportZoom: (zoom: number) => void
}

export function centerCanvasViewportOnMinimapPoint({
  center,
  canvasSize,
  instance,
  persistViewport,
  onViewportChange,
  setCanvasViewport,
  setViewportZoom
}: CenterCanvasViewportOnMinimapPointInput): void {
  const zoom = instance.getZoom()
  const viewport = {
    x: resolveCanvasDimension(canvasSize.width, 960) / 2 - center.x * zoom,
    y: resolveCanvasDimension(canvasSize.height, 640) / 2 - center.y * zoom,
    zoom
  }

  setViewportZoom(zoom)
  setCanvasViewport(viewport)
  void transitionWorkbenchViewport(instance, {
    intent: { type: 'instant' },
    type: 'set-viewport',
    viewport
  })

  if (persistViewport) {
    onViewportChange(viewport)
  }
}

function resolveCanvasDimension(value: number, fallback: number): number {
  return value > 0 ? value : fallback
}
