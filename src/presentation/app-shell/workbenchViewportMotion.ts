import type { Edge, FitViewOptions, ReactFlowInstance, Rect, Viewport } from '@xyflow/react'

import type { WorkbenchFlowNode } from './types'

export type WorkbenchViewportMotionIntent =
  | { readonly type: 'instant' }
  | { readonly type: 'quick' }
  | { readonly type: 'spatial' }
  | {
      readonly canvasSize: { readonly height: number; readonly width: number }
      readonly type: 'adaptive-focus'
    }

interface ResolveWorkbenchViewportTransitionInput {
  readonly currentViewport?: Viewport
  readonly intent: WorkbenchViewportMotionIntent
  readonly reducedMotion: boolean
  readonly targetCenter?: { readonly x: number; readonly y: number }
  readonly targetZoom?: number
}

export interface WorkbenchViewportTransition {
  readonly duration: number
  readonly ease?: (progress: number) => number
  readonly interpolate?: 'linear' | 'smooth'
}

type WorkbenchFitViewOptions = Omit<
  FitViewOptions<WorkbenchFlowNode>,
  'duration' | 'ease' | 'interpolate'
>

type WorkbenchFitBoundsOptions = Omit<
  NonNullable<Parameters<ReactFlowInstance<WorkbenchFlowNode, Edge>['fitBounds']>[1]>,
  'duration' | 'ease' | 'interpolate'
>

export type WorkbenchViewportCommand =
  | {
      readonly center: { readonly x: number; readonly y: number }
      readonly intent: WorkbenchViewportMotionIntent
      readonly type: 'center'
      readonly zoom?: number
    }
  | ({
      readonly intent: WorkbenchViewportMotionIntent
      readonly type: 'fit-bounds'
    } & WorkbenchFitBoundsOptions & { readonly bounds: Rect })
  | ({
      readonly intent: WorkbenchViewportMotionIntent
      readonly type: 'fit-view'
    } & WorkbenchFitViewOptions)
  | {
      readonly intent: WorkbenchViewportMotionIntent
      readonly type: 'set-viewport'
      readonly viewport: Viewport
    }
  | { readonly intent: WorkbenchViewportMotionIntent; readonly type: 'zoom-in' }
  | { readonly intent: WorkbenchViewportMotionIntent; readonly type: 'zoom-out' }

const quickTransitionDuration = 180
const spatialTransitionDuration = 220
const adaptiveFocusMinimumDuration = spatialTransitionDuration
const adaptiveFocusMaximumDuration = 300
const durationPerViewport = 48
const durationPerZoomStop = 20
const maximumSmoothTravelInViewports = 1.5
const fallbackCanvasSize = { height: 640, width: 960 }

function easeOutCubic(progress: number): number {
  return 1 - (1 - progress) ** 3
}

const continuousTransition = {
  ease: easeOutCubic,
  interpolate: 'smooth' as const
}

export function resolveWorkbenchViewportTransition(
  input: ResolveWorkbenchViewportTransitionInput
): WorkbenchViewportTransition {
  const { currentViewport, intent, reducedMotion, targetCenter, targetZoom } = input
  if (intent.type === 'instant') {
    return { duration: 0 }
  }

  if (reducedMotion) {
    return { duration: 0 }
  }

  if (intent.type === 'adaptive-focus') {
    if (!currentViewport || !targetCenter || targetZoom === undefined) {
      throw new TypeError('Adaptive viewport focus requires current and target geometry.')
    }
    if (currentViewport.zoom <= 0 || targetZoom <= 0) {
      throw new RangeError('Adaptive viewport focus zoom must be positive.')
    }

    const canvasSize =
      intent.canvasSize.width > 0 && intent.canvasSize.height > 0
        ? intent.canvasSize
        : fallbackCanvasSize
    const targetViewport = {
      x: canvasSize.width / 2 - targetCenter.x * targetZoom,
      y: canvasSize.height / 2 - targetCenter.y * targetZoom
    }
    const travelDistance = Math.hypot(
      targetViewport.x - currentViewport.x,
      targetViewport.y - currentViewport.y
    )
    const viewportDiagonal = Math.hypot(canvasSize.width, canvasSize.height)
    const travelInViewports = travelDistance / viewportDiagonal
    const zoomStops = Math.abs(Math.log2(targetZoom / currentViewport.zoom))
    const duration = Math.min(
      adaptiveFocusMaximumDuration,
      adaptiveFocusMinimumDuration +
        Math.round(travelInViewports * durationPerViewport + zoomStops * durationPerZoomStop)
    )

    return {
      duration,
      ...continuousTransition,
      ...(travelInViewports > maximumSmoothTravelInViewports
        ? { interpolate: 'linear' as const }
        : {})
    }
  }

  if (intent.type === 'quick') {
    return { duration: quickTransitionDuration, ...continuousTransition }
  }

  return { duration: spatialTransitionDuration, ...continuousTransition }
}

export function transitionWorkbenchViewport(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  command: WorkbenchViewportCommand
): Promise<boolean> {
  const transition = resolveWorkbenchViewportCommandTransition(instance, command)

  switch (command.type) {
    case 'center':
      return instance.setCenter(command.center.x, command.center.y, {
        ...transition,
        ...(command.zoom === undefined ? {} : { zoom: command.zoom })
      })
    case 'fit-bounds':
      return instance.fitBounds(command.bounds, {
        ...transition,
        ...(command.padding === undefined ? {} : { padding: command.padding })
      })
    case 'fit-view':
      return instance.fitView({
        ...transition,
        ...(command.includeHiddenNodes === undefined
          ? {}
          : { includeHiddenNodes: command.includeHiddenNodes }),
        ...(command.maxZoom === undefined ? {} : { maxZoom: command.maxZoom }),
        ...(command.minZoom === undefined ? {} : { minZoom: command.minZoom }),
        ...(command.nodes === undefined ? {} : { nodes: command.nodes }),
        ...(command.padding === undefined ? {} : { padding: command.padding })
      })
    case 'set-viewport':
      return instance.setViewport(command.viewport, transition)
    case 'zoom-in':
      return instance.zoomIn(transition)
    case 'zoom-out':
      return instance.zoomOut(transition)
  }
}

export function resolveWorkbenchViewportCommandTransition(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  command: WorkbenchViewportCommand
): WorkbenchViewportTransition {
  return resolveWorkbenchViewportTransition({
    intent: command.intent,
    reducedMotion: prefersReducedMotion(),
    ...(command.intent.type === 'adaptive-focus'
      ? {
          currentViewport: instance.getViewport()
        }
      : {}),
    ...(command.type === 'center' ? { targetCenter: command.center, targetZoom: command.zoom } : {})
  })
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
