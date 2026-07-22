import type { Viewport } from '@xyflow/react'

import { resolveWorkbenchFocusTransition } from './workbenchFocusTransition'

interface MinimapFocusDurationInput {
  readonly currentViewport: Viewport
  readonly canvasSize: { readonly width: number; readonly height: number }
  readonly targetCenter: { readonly x: number; readonly y: number }
  readonly targetZoom: number
}

const fallbackCanvasSize = { width: 960, height: 640 }

export function resolveMinimapFocusDuration({
  currentViewport,
  canvasSize,
  targetCenter,
  targetZoom
}: MinimapFocusDurationInput): number {
  return resolveWorkbenchFocusTransition({
    canvasSize,
    currentViewport,
    intent: 'minimap',
    reducedMotion: false,
    targetCenter,
    targetZoom
  }).duration
}

export function readMinimapFocusCanvasSize(): { readonly width: number; readonly height: number } {
  const canvas = document.querySelector<HTMLElement>('.react-flow')

  return {
    width: resolveCanvasDimension(canvas?.clientWidth, fallbackCanvasSize.width),
    height: resolveCanvasDimension(canvas?.clientHeight, fallbackCanvasSize.height)
  }
}

function resolveCanvasDimension(value: number | undefined, fallback: number): number {
  return value && value > 0 ? value : fallback
}
