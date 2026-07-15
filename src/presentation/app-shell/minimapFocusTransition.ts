import type { Viewport } from '@xyflow/react'

interface MinimapFocusDurationInput {
  readonly currentViewport: Viewport
  readonly canvasSize: { readonly width: number; readonly height: number }
  readonly targetCenter: { readonly x: number; readonly y: number }
  readonly targetZoom: number
}

const minimumFocusDuration = 180
const maximumFocusDuration = 300
const durationPerPixel = 0.06
const fallbackCanvasSize = { width: 960, height: 640 }

export function resolveMinimapFocusDuration({
  currentViewport,
  canvasSize,
  targetCenter,
  targetZoom
}: MinimapFocusDurationInput): number {
  const targetViewport = {
    x: canvasSize.width / 2 - targetCenter.x * targetZoom,
    y: canvasSize.height / 2 - targetCenter.y * targetZoom
  }
  const travelDistance = Math.hypot(
    targetViewport.x - currentViewport.x,
    targetViewport.y - currentViewport.y
  )

  return Math.min(
    maximumFocusDuration,
    minimumFocusDuration + Math.round(travelDistance * durationPerPixel)
  )
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
