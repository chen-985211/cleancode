import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'
import type { MutableRefObject } from 'react'

import type { MinimapViewportCenter } from './CanvasMinimap'
import type { WorkbenchFlowNode } from './types/workbenchFlowNode'
import type { WorkbenchSnapshot } from './types/workbenchSnapshot'
import {
  subscribeWorkbenchViewportMotionCompletion,
  transitionWorkbenchViewport,
  type WorkbenchViewportMotionCompletion
} from './workbenchViewportMotion'
import { subscribeWorkbenchDirectZoomCompletion } from './workbenchDirectZoom'

interface CanvasViewportProjection {
  readonly projectCanvasViewport: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
}

interface CanvasViewportPersistence {
  readonly onViewportChange: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
}

interface SynchronizeCanvasViewportFromMoveInput extends CanvasViewportProjection {
  readonly onRasterZoomChange?: (zoom: number) => void
  readonly viewport: Viewport
}

export function synchronizeCanvasViewportFromMove({
  onRasterZoomChange,
  viewport,
  projectCanvasViewport
}: SynchronizeCanvasViewportFromMoveInput): void {
  onRasterZoomChange?.(viewport.zoom)
  projectCanvasViewport(toCanvasViewportSnapshot(viewport))
}

interface PersistCanvasViewportFromMoveEndInput extends CanvasViewportPersistence {
  readonly event: unknown
  readonly isRestoringViewport: boolean
  readonly onRasterInteractionEnd?: (zoom: number) => void
  readonly viewport: Viewport
}

export function persistCanvasViewportFromMoveEnd({
  event,
  isRestoringViewport,
  onRasterInteractionEnd,
  viewport,
  onViewportChange
}: PersistCanvasViewportFromMoveEndInput): void {
  onRasterInteractionEnd?.(viewport.zoom)
  if (!event || isRestoringViewport) {
    return
  }

  onViewportChange(toCanvasViewportSnapshot(viewport))
}

interface CommitCompletedCanvasViewportMotionInput
  extends CanvasViewportProjection, CanvasViewportPersistence {
  readonly completion: WorkbenchViewportMotionCompletion
}

interface CommitCanvasViewportInput extends CanvasViewportProjection, CanvasViewportPersistence {
  readonly viewport: Viewport
}

function commitCanvasViewport({
  viewport,
  onViewportChange,
  projectCanvasViewport
}: CommitCanvasViewportInput): void {
  const canvasViewport = toCanvasViewportSnapshot(viewport)
  projectCanvasViewport(canvasViewport)
  onViewportChange(canvasViewport)
}

export function commitCompletedCanvasViewportMotion({
  completion,
  onViewportChange,
  projectCanvasViewport
}: CommitCompletedCanvasViewportMotionInput): void {
  if (completion.intent.type === 'instant') {
    return
  }

  commitCanvasViewport({
    viewport: completion.viewport,
    onViewportChange,
    projectCanvasViewport
  })
}

export function subscribeCanvasViewportMotionCompletion({
  instance,
  onViewportChangeRef,
  projectCanvasViewport
}: CanvasViewportProjection & {
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly onViewportChangeRef: MutableRefObject<CanvasViewportPersistence['onViewportChange']>
}): () => void {
  const unsubscribeProgrammatic = subscribeWorkbenchViewportMotionCompletion(
    instance,
    (completion) =>
      commitCompletedCanvasViewportMotion({
        completion,
        onViewportChange: onViewportChangeRef.current,
        projectCanvasViewport
      })
  )
  const unsubscribeDirect = subscribeWorkbenchDirectZoomCompletion(instance, ({ viewport }) =>
    commitCanvasViewport({
      viewport,
      onViewportChange: onViewportChangeRef.current,
      projectCanvasViewport
    })
  )

  return () => {
    unsubscribeProgrammatic()
    unsubscribeDirect()
  }
}

interface RestoreCanvasViewportInput {
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly viewport: WorkbenchSnapshot['graph']['viewport']
  readonly graphId: string
  readonly restoredGraphIdRef: MutableRefObject<string | null>
  readonly isRestoringViewportRef: MutableRefObject<boolean>
  readonly projectCanvasViewport: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
}

export function restoreCanvasViewport({
  instance,
  viewport,
  graphId,
  restoredGraphIdRef,
  isRestoringViewportRef,
  projectCanvasViewport
}: RestoreCanvasViewportInput): void {
  restoredGraphIdRef.current = graphId
  isRestoringViewportRef.current = true
  projectCanvasViewport(viewport)

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

function toCanvasViewportSnapshot(viewport: Viewport): WorkbenchSnapshot['graph']['viewport'] {
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
  readonly projectCanvasViewport: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
}

export function centerCanvasViewportOnMinimapPoint({
  center,
  canvasSize,
  instance,
  persistViewport,
  onViewportChange,
  projectCanvasViewport
}: CenterCanvasViewportOnMinimapPointInput): void {
  const zoom = instance.getZoom()
  const viewport = {
    x: resolveCanvasDimension(canvasSize.width, 960) / 2 - center.x * zoom,
    y: resolveCanvasDimension(canvasSize.height, 640) / 2 - center.y * zoom,
    zoom
  }

  projectCanvasViewport(viewport)
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
