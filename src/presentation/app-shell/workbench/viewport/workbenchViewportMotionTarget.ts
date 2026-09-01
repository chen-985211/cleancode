import type { Viewport } from '@xyflow/react'

import {
  maximumCanvasZoom,
  minimumCanvasZoom
} from '../../../../contexts/block-graph/application/dto/BlockGraphSnapshot'

interface WorkbenchCanvasSizeIntent {
  readonly canvasSize?: { readonly height: number; readonly width: number }
  readonly type: string
}

export function resolveWorkbenchCommandCanvasSize(
  intent: WorkbenchCanvasSizeIntent,
  fallback: { readonly height: number; readonly width: number }
): { readonly height: number; readonly width: number } {
  if (
    intent.type === 'adaptive-focus' &&
    intent.canvasSize &&
    intent.canvasSize.width > 0 &&
    intent.canvasSize.height > 0
  ) {
    return intent.canvasSize
  }

  const canvas = typeof document === 'undefined' ? null : document.querySelector('.react-flow')
  if (canvas instanceof HTMLElement && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
    return { height: canvas.clientHeight, width: canvas.clientWidth }
  }
  return fallback
}

export function resolveWorkbenchZoomTarget(
  currentViewport: Viewport,
  canvasSize: { readonly height: number; readonly width: number },
  factor: number
): Viewport {
  const zoom = Math.min(
    maximumCanvasZoom,
    Math.max(minimumCanvasZoom, currentViewport.zoom * factor)
  )
  const centerX = (canvasSize.width / 2 - currentViewport.x) / currentViewport.zoom
  const centerY = (canvasSize.height / 2 - currentViewport.y) / currentViewport.zoom

  return {
    x: canvasSize.width / 2 - centerX * zoom,
    y: canvasSize.height / 2 - centerY * zoom,
    zoom
  }
}
