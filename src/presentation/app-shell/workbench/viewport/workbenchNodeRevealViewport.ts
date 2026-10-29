import type { Rect, Viewport } from '@xyflow/react'
import { minimumCanvasZoom } from '../../../../contexts/block-graph/application/dto/BlockGraphSnapshot'

// Preserve the current view, translating each axis only as far as containment requires.
export function resolveWorkbenchNodeRevealViewport({
  bounds,
  currentViewport,
  targetZoom,
  canvasSize,
  safeViewport
}: {
  readonly bounds: Rect
  readonly currentViewport: Viewport
  readonly targetZoom: number
  readonly canvasSize: { readonly width: number; readonly height: number }
  readonly safeViewport: Rect
}): Viewport {
  const zoom = Math.max(
    minimumCanvasZoom,
    Math.min(targetZoom, safeViewport.width / bounds.width, safeViewport.height / bounds.height)
  )
  // Shrink around the current view center before applying the minimum translation.
  const ratio = zoom / currentViewport.zoom
  const x =
    ratio === 1
      ? currentViewport.x
      : canvasSize.width / 2 - (canvasSize.width / 2 - currentViewport.x) * ratio
  const y =
    ratio === 1
      ? currentViewport.y
      : canvasSize.height / 2 - (canvasSize.height / 2 - currentViewport.y) * ratio
  return {
    x: revealAxis(x, bounds.x * zoom, bounds.width * zoom, safeViewport.x, safeViewport.width),
    y: revealAxis(y, bounds.y * zoom, bounds.height * zoom, safeViewport.y, safeViewport.height),
    zoom
  }
}

function revealAxis(
  offset: number,
  position: number,
  size: number,
  start: number,
  available: number
): number {
  // At the minimum zoom, an uncontainable axis shows the middle of the target.
  if (size > available) return start + available / 2 - position - size / 2
  return Math.max(start - position, Math.min(start + available - position - size, offset))
}
