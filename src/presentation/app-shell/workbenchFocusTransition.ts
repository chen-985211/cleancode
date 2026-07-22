import type { Viewport } from '@xyflow/react'

interface ResolveWorkbenchFocusTransitionInput {
  readonly canvasSize: { readonly width: number; readonly height: number }
  readonly currentViewport: Viewport
  readonly intent: 'minimap' | 'shortcut'
  readonly reducedMotion: boolean
  readonly targetCenter: { readonly x: number; readonly y: number }
  readonly targetZoom: number
}

const focusMotionByIntent = {
  minimap: { maximumDuration: 300, minimumDuration: 180 },
  shortcut: { maximumDuration: 260, minimumDuration: 180 }
} as const
const durationPerPixel = 0.06

export function resolveWorkbenchFocusTransition({
  canvasSize,
  currentViewport,
  intent,
  reducedMotion,
  targetCenter,
  targetZoom
}: ResolveWorkbenchFocusTransitionInput): {
  readonly duration: number
  readonly interpolate: 'linear'
} {
  if (reducedMotion) {
    return { duration: 0, interpolate: 'linear' }
  }

  const targetViewport = {
    x: canvasSize.width / 2 - targetCenter.x * targetZoom,
    y: canvasSize.height / 2 - targetCenter.y * targetZoom
  }
  const travelDistance = Math.hypot(
    targetViewport.x - currentViewport.x,
    targetViewport.y - currentViewport.y
  )
  const { maximumDuration, minimumDuration } = focusMotionByIntent[intent]

  return {
    duration: Math.min(
      maximumDuration,
      minimumDuration + Math.round(travelDistance * durationPerPixel)
    ),
    interpolate: 'linear'
  }
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
