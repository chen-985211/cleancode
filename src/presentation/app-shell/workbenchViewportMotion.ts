import type { Edge, FitViewOptions, ReactFlowInstance, Rect, Viewport } from '@xyflow/react'

import type { WorkbenchFlowNode } from './types'

type ViewportCommandType =
  'center' | 'fit-bounds' | 'fit-view' | 'set-viewport' | 'zoom-in' | 'zoom-out'

export type WorkbenchViewportMotionIntent =
  | { readonly type: 'instant' }
  | { readonly type: 'quick' }
  | { readonly path?: 'continuous' | 'direct'; readonly type: 'spatial' }
  | {
      readonly canvasSize: { readonly height: number; readonly width: number }
      readonly source: 'minimap' | 'shortcut'
      readonly type: 'adaptive-focus'
    }

interface ResolveWorkbenchViewportTransitionInput {
  readonly commandType: ViewportCommandType
  readonly currentViewport?: Viewport
  readonly intent: WorkbenchViewportMotionIntent
  readonly reducedMotion: boolean
  readonly targetCenter?: { readonly x: number; readonly y: number }
  readonly targetZoom?: number
}

export interface WorkbenchViewportTransition {
  readonly duration: number
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

const quickZoomDuration = 160
const quickTransitionDuration = 180
const spatialTransitionDuration = 220
const durationPerPixel = 0.06
const focusMotionBySource = {
  minimap: { maximumDuration: 300, minimumDuration: 180 },
  shortcut: { maximumDuration: 260, minimumDuration: 180 }
} as const

export function resolveWorkbenchViewportTransition({
  commandType,
  currentViewport,
  intent,
  reducedMotion,
  targetCenter,
  targetZoom
}: ResolveWorkbenchViewportTransitionInput): WorkbenchViewportTransition {
  if (intent.type === 'instant') {
    return { duration: 0 }
  }

  if (intent.type === 'adaptive-focus') {
    const interpolation = { interpolate: 'linear' as const }
    if (reducedMotion) {
      return { duration: 0, ...interpolation }
    }

    if (!currentViewport || !targetCenter || targetZoom === undefined) {
      throw new TypeError('Adaptive viewport focus requires current and target geometry.')
    }

    const { canvasSize } = intent
    const targetViewport = {
      x: canvasSize.width / 2 - targetCenter.x * targetZoom,
      y: canvasSize.height / 2 - targetCenter.y * targetZoom
    }
    const travelDistance = Math.hypot(
      targetViewport.x - currentViewport.x,
      targetViewport.y - currentViewport.y
    )
    const { maximumDuration, minimumDuration } = focusMotionBySource[intent.source]

    return {
      duration: Math.min(
        maximumDuration,
        minimumDuration + Math.round(travelDistance * durationPerPixel)
      ),
      ...interpolation
    }
  }

  const interpolate =
    intent.type === 'spatial' && intent.path === 'direct' ? { interpolate: 'linear' as const } : {}
  if (reducedMotion) {
    return { duration: 0, ...interpolate }
  }

  if (intent.type === 'quick') {
    const isZoomCommand = commandType === 'zoom-in' || commandType === 'zoom-out'
    return { duration: isZoomCommand ? quickZoomDuration : quickTransitionDuration }
  }

  return { duration: spatialTransitionDuration, ...interpolate }
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
    commandType: command.type,
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
