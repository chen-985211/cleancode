import {
  getViewportForBounds,
  type Edge,
  type FitViewOptions,
  type ReactFlowInstance,
  type Rect,
  type Viewport
} from '@xyflow/react'

import {
  maximumCanvasZoom,
  minimumCanvasZoom
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchFlowNode } from './types'
import {
  createWorkbenchViewportFlight,
  resolveWorkbenchViewportFlightPresentation,
  type WorkbenchViewportFlight
} from './workbenchViewportFlight'
import {
  advanceCriticalSpringAxis,
  isCriticalSpringAxisSettled,
  type CriticalSpringAxis
} from './workbenchViewportSpring'

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
  readonly targetViewport?: Viewport
}

export interface WorkbenchViewportTransition {
  readonly dampingRatio?: 1
  readonly response?: number
}

export interface WorkbenchViewportMotionFrameScheduler {
  readonly cancelFrame: (frameId: number) => void
  readonly now: () => number
  readonly requestFrame: (callback: FrameRequestCallback) => number
}

export interface WorkbenchViewportMotionCompletion {
  readonly intent: WorkbenchViewportMotionIntent
  readonly viewport: Viewport
}

export type WorkbenchViewportMotionCompletionListener = (
  completion: WorkbenchViewportMotionCompletion
) => void

export type WorkbenchViewportMotionPresentationListener = (viewport: Viewport) => void

export interface WorkbenchViewportMotionController {
  readonly cancel: (instance?: ReactFlowInstance<WorkbenchFlowNode, Edge>) => void
  readonly subscribe: (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    listener: WorkbenchViewportMotionCompletionListener
  ) => () => void
  readonly subscribePresentation: (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    listener: WorkbenchViewportMotionPresentationListener
  ) => () => void
  readonly transition: (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    command: WorkbenchViewportCommand
  ) => Promise<boolean>
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

const fallbackCanvasSize = { height: 640, width: 960 }
const quickSpringResponse = 0.3
const spatialSpringResponse = 0.34
const adaptiveFocusMaximumResponse = 0.42
const responsePerViewport = 0.05
const responsePerZoomStop = 0.02
const maximumSpringRuntime = 1_200
const viewportValueSettlement = 0.1
const viewportSpeedSettlement = 2
const zoomValueSettlement = 0.000_2
const zoomSpeedSettlement = 0.002
const flightProgressValueSettlement = 0.001
const flightProgressSpeedSettlement = 0.01

export function resolveWorkbenchViewportTransition(
  input: ResolveWorkbenchViewportTransitionInput
): WorkbenchViewportTransition {
  const { currentViewport, intent, reducedMotion, targetViewport } = input
  if (intent.type === 'instant') {
    return {}
  }

  if (reducedMotion) {
    return {}
  }

  if (intent.type === 'adaptive-focus') {
    if (!currentViewport || !targetViewport) {
      throw new TypeError('Adaptive viewport focus requires current and target geometry.')
    }
    if (currentViewport.zoom <= 0 || targetViewport.zoom <= 0) {
      throw new RangeError('Adaptive viewport focus zoom must be positive.')
    }

    const canvasSize =
      intent.canvasSize.width > 0 && intent.canvasSize.height > 0
        ? intent.canvasSize
        : fallbackCanvasSize
    const travelDistance = Math.hypot(
      targetViewport.x - currentViewport.x,
      targetViewport.y - currentViewport.y
    )
    const viewportDiagonal = Math.hypot(canvasSize.width, canvasSize.height)
    const travelInViewports = travelDistance / viewportDiagonal
    const zoomStops = Math.abs(Math.log2(targetViewport.zoom / currentViewport.zoom))
    const response = Math.min(
      adaptiveFocusMaximumResponse,
      spatialSpringResponse +
        travelInViewports * responsePerViewport +
        zoomStops * responsePerZoomStop
    )

    return {
      dampingRatio: 1,
      response
    }
  }

  if (intent.type === 'quick') {
    return { dampingRatio: 1, response: quickSpringResponse }
  }

  return { dampingRatio: 1, response: spatialSpringResponse }
}

export function resolveWorkbenchViewportCommandTarget(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  command: WorkbenchViewportCommand,
  currentViewport = instance.getViewport()
): Viewport {
  const canvasSize = resolveCommandCanvasSize(command)

  switch (command.type) {
    case 'center': {
      const zoom = command.zoom ?? currentViewport.zoom
      return {
        x: canvasSize.width / 2 - command.center.x * zoom,
        y: canvasSize.height / 2 - command.center.y * zoom,
        zoom
      }
    }
    case 'fit-bounds':
      return getViewportForBounds(
        command.bounds,
        canvasSize.width,
        canvasSize.height,
        minimumCanvasZoom,
        maximumCanvasZoom,
        command.padding ?? 0.1
      )
    case 'fit-view': {
      const nodes = (command.nodes ?? instance.getNodes())
        .map((node) => ('position' in node ? node : instance.getNode(node.id)))
        .filter((node): node is WorkbenchFlowNode =>
          Boolean(node && (command.includeHiddenNodes || !node.hidden))
        )
      if (nodes.length === 0) {
        return currentViewport
      }
      return getViewportForBounds(
        instance.getNodesBounds(nodes),
        canvasSize.width,
        canvasSize.height,
        command.minZoom ?? minimumCanvasZoom,
        command.maxZoom ?? maximumCanvasZoom,
        command.padding ?? 0.1
      )
    }
    case 'set-viewport':
      return command.viewport
    case 'zoom-in':
      return resolveZoomTarget(currentViewport, canvasSize, 1.2)
    case 'zoom-out':
      return resolveZoomTarget(currentViewport, canvasSize, 1 / 1.2)
  }
}

interface ActiveViewportMotion {
  elapsedMilliseconds: number
  flight: WorkbenchViewportFlight | null
  flightProgress: CriticalSpringAxis
  frameId: number | null
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  intent: WorkbenchViewportMotionIntent
  lastTimestamp: number
  presentation: Viewport
  presentationVelocity: Viewport
  requestId: number
  resolve: (completed: boolean) => void
  response: number
  target: Viewport
  x: CriticalSpringAxis
  y: CriticalSpringAxis
  zoom: CriticalSpringAxis
}

export function createWorkbenchViewportMotionController(
  scheduler: WorkbenchViewportMotionFrameScheduler
): WorkbenchViewportMotionController {
  let activeMotion: ActiveViewportMotion | null = null
  const completionListeners = new WeakMap<
    ReactFlowInstance<WorkbenchFlowNode, Edge>,
    Set<WorkbenchViewportMotionCompletionListener>
  >()
  const presentationListeners = new WeakMap<
    ReactFlowInstance<WorkbenchFlowNode, Edge>,
    Set<WorkbenchViewportMotionPresentationListener>
  >()
  let latestRequest: {
    readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
    readonly requestId: number
  } | null = null
  let nextRequestId = 1

  const cancelActiveMotion = (instance?: ReactFlowInstance<WorkbenchFlowNode, Edge>): void => {
    if (!activeMotion || (instance && activeMotion.instance !== instance)) {
      return
    }
    if (activeMotion.frameId !== null) {
      scheduler.cancelFrame(activeMotion.frameId)
    }
    activeMotion.resolve(false)
    activeMotion = null
  }

  const cancel = (instance?: ReactFlowInstance<WorkbenchFlowNode, Edge>): void => {
    if (latestRequest && (!instance || latestRequest.instance === instance)) {
      latestRequest = null
    }
    cancelActiveMotion(instance)
  }

  const subscribe = (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    listener: WorkbenchViewportMotionCompletionListener
  ): (() => void) => {
    const listeners = completionListeners.get(instance) ?? new Set()
    listeners.add(listener)
    completionListeners.set(instance, listeners)

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        completionListeners.delete(instance)
      }
    }
  }

  const subscribePresentation = (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    listener: WorkbenchViewportMotionPresentationListener
  ): (() => void) => {
    const listeners = presentationListeners.get(instance) ?? new Set()
    listeners.add(listener)
    presentationListeners.set(instance, listeners)

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        presentationListeners.delete(instance)
      }
    }
  }

  const applyPresentedViewport = (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    viewport: Viewport
  ): Promise<boolean> => {
    const applied = applyViewport(instance, viewport)
    void applied.then((didApply) => {
      if (didApply) {
        presentationListeners.get(instance)?.forEach((listener) => listener(viewport))
      }
    })
    return applied
  }

  const completeRequest = (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    requestId: number,
    applied: boolean,
    completion: WorkbenchViewportMotionCompletion
  ): boolean => {
    const isLatest = latestRequest?.instance === instance && latestRequest.requestId === requestId
    if (isLatest) {
      latestRequest = null
    }
    const completed = applied && isLatest
    if (completed) {
      completionListeners.get(instance)?.forEach((listener) => listener(completion))
    }
    return completed
  }

  const scheduleNextFrame = (): void => {
    if (!activeMotion || activeMotion.frameId !== null) {
      return
    }
    activeMotion.frameId = scheduler.requestFrame(advanceMotion)
  }

  const finishMotion = (motion: ActiveViewportMotion): void => {
    if (activeMotion?.requestId !== motion.requestId) {
      return
    }
    activeMotion = null
    void applyPresentedViewport(motion.instance, motion.target).then((applied) =>
      motion.resolve(
        completeRequest(motion.instance, motion.requestId, applied, {
          intent: motion.intent,
          viewport: motion.target
        })
      )
    )
  }

  const advanceMotion = (timestamp: number): void => {
    const motion = activeMotion
    if (!motion) {
      return
    }
    motion.frameId = null
    const elapsedSinceFrame = Math.max(0, (timestamp - motion.lastTimestamp) / 1_000)
    motion.elapsedMilliseconds += elapsedSinceFrame * 1_000
    motion.lastTimestamp = timestamp
    motion.x = advanceCriticalSpringAxis(
      motion.x,
      motion.target.x,
      motion.response,
      elapsedSinceFrame
    )
    motion.y = advanceCriticalSpringAxis(
      motion.y,
      motion.target.y,
      motion.response,
      elapsedSinceFrame
    )
    motion.zoom = advanceCriticalSpringAxis(
      motion.zoom,
      motion.target.zoom,
      motion.response,
      elapsedSinceFrame
    )
    motion.flightProgress = advanceCriticalSpringAxis(
      motion.flightProgress,
      1,
      motion.response,
      elapsedSinceFrame
    )

    const baseViewport = { x: motion.x.value, y: motion.y.value, zoom: motion.zoom.value }
    const presentation = resolveWorkbenchViewportFlightPresentation(
      baseViewport,
      motion.flightProgress.value,
      motion.flight
    )
    motion.presentationVelocity = resolvePresentationVelocity(
      motion,
      presentation,
      elapsedSinceFrame
    )
    motion.presentation = presentation

    if (motion.elapsedMilliseconds >= maximumSpringRuntime || isMotionSettled(motion)) {
      finishMotion(motion)
      return
    }
    void applyPresentedViewport(motion.instance, presentation)
    scheduleNextFrame()
  }

  const transition = (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    command: WorkbenchViewportCommand
  ): Promise<boolean> => {
    const currentViewport =
      activeMotion?.instance === instance ? activeMotion.presentation : instance.getViewport()
    const target = resolveWorkbenchViewportCommandTarget(instance, command, currentViewport)
    const transitionOptions = resolveWorkbenchViewportTransition({
      currentViewport,
      intent: command.intent,
      reducedMotion: prefersReducedMotion(),
      targetViewport: target
    })
    const requestId = nextRequestId
    nextRequestId += 1

    if (transitionOptions.response === undefined) {
      cancelActiveMotion()
      latestRequest = { instance, requestId }
      return applyPresentedViewport(instance, target).then((applied) =>
        completeRequest(instance, requestId, applied, { intent: command.intent, viewport: target })
      )
    }
    const springResponse = transitionOptions.response

    return new Promise<boolean>((resolve) => {
      if (activeMotion?.instance === instance) {
        activeMotion.resolve(false)
        activeMotion.elapsedMilliseconds = 0
        activeMotion.flight = resolveViewportFlight(currentViewport, target, command.intent)
        activeMotion.flightProgress = { value: 0, velocity: 0 }
        activeMotion.intent = command.intent
        activeMotion.lastTimestamp = scheduler.now()
        activeMotion.x = {
          value: currentViewport.x,
          velocity: activeMotion.presentationVelocity.x
        }
        activeMotion.y = {
          value: currentViewport.y,
          velocity: activeMotion.presentationVelocity.y
        }
        activeMotion.zoom = {
          value: currentViewport.zoom,
          velocity: activeMotion.presentationVelocity.zoom
        }
        activeMotion.requestId = requestId
        activeMotion.resolve = resolve
        activeMotion.response = springResponse
        activeMotion.target = target
        latestRequest = { instance, requestId }
        scheduleNextFrame()
        return
      }

      cancelActiveMotion()
      latestRequest = { instance, requestId }
      activeMotion = {
        elapsedMilliseconds: 0,
        flight: resolveViewportFlight(currentViewport, target, command.intent),
        flightProgress: { value: 0, velocity: 0 },
        frameId: null,
        instance,
        intent: command.intent,
        lastTimestamp: scheduler.now(),
        presentation: currentViewport,
        presentationVelocity: { x: 0, y: 0, zoom: 0 },
        requestId,
        resolve,
        response: springResponse,
        target,
        x: { value: currentViewport.x, velocity: 0 },
        y: { value: currentViewport.y, velocity: 0 },
        zoom: { value: currentViewport.zoom, velocity: 0 }
      }
      scheduleNextFrame()
    })
  }

  return { cancel, subscribe, subscribePresentation, transition }
}

const browserViewportMotionController = createWorkbenchViewportMotionController({
  cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
  now: () => window.performance.now(),
  requestFrame: (callback) => window.requestAnimationFrame(callback)
})

export function transitionWorkbenchViewport(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  command: WorkbenchViewportCommand
): Promise<boolean> {
  return browserViewportMotionController.transition(instance, command)
}

export function cancelWorkbenchViewportMotion(
  instance?: ReactFlowInstance<WorkbenchFlowNode, Edge>
): void {
  browserViewportMotionController.cancel(instance)
}

export function subscribeWorkbenchViewportMotionCompletion(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  listener: WorkbenchViewportMotionCompletionListener
): () => void {
  return browserViewportMotionController.subscribe(instance, listener)
}

export function subscribeWorkbenchViewportMotionPresentation(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  listener: WorkbenchViewportMotionPresentationListener
): () => void {
  return browserViewportMotionController.subscribePresentation(instance, listener)
}

function resolveCommandCanvasSize(command: WorkbenchViewportCommand): {
  readonly height: number
  readonly width: number
} {
  if (
    command.intent.type === 'adaptive-focus' &&
    command.intent.canvasSize.width > 0 &&
    command.intent.canvasSize.height > 0
  ) {
    return command.intent.canvasSize
  }

  const canvas = typeof document === 'undefined' ? null : document.querySelector('.react-flow')
  if (canvas instanceof HTMLElement && canvas.clientWidth > 0 && canvas.clientHeight > 0) {
    return { height: canvas.clientHeight, width: canvas.clientWidth }
  }
  return fallbackCanvasSize
}

function resolveZoomTarget(
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

function isMotionSettled(motion: ActiveViewportMotion): boolean {
  const viewportThresholds = { speed: viewportSpeedSettlement, value: viewportValueSettlement }
  const zoomThresholds = { speed: zoomSpeedSettlement, value: zoomValueSettlement }

  return (
    isCriticalSpringAxisSettled(motion.x, motion.target.x, viewportThresholds) &&
    isCriticalSpringAxisSettled(motion.y, motion.target.y, viewportThresholds) &&
    isCriticalSpringAxisSettled(motion.zoom, motion.target.zoom, zoomThresholds) &&
    (!motion.flight ||
      isCriticalSpringAxisSettled(motion.flightProgress, 1, {
        speed: flightProgressSpeedSettlement,
        value: flightProgressValueSettlement
      }))
  )
}

function resolveViewportFlight(
  currentViewport: Viewport,
  targetViewport: Viewport,
  intent: WorkbenchViewportMotionIntent
): WorkbenchViewportFlight | null {
  return intent.type === 'adaptive-focus'
    ? createWorkbenchViewportFlight(currentViewport, targetViewport, intent.canvasSize)
    : null
}

function resolvePresentationVelocity(
  motion: ActiveViewportMotion,
  presentation: Viewport,
  deltaSeconds: number
): Viewport {
  if (!motion.flight) {
    return {
      x: motion.x.velocity,
      y: motion.y.velocity,
      zoom: motion.zoom.velocity
    }
  }
  if (deltaSeconds <= 0) {
    return motion.presentationVelocity
  }

  return {
    x: (presentation.x - motion.presentation.x) / deltaSeconds,
    y: (presentation.y - motion.presentation.y) / deltaSeconds,
    zoom: (presentation.zoom - motion.presentation.zoom) / deltaSeconds
  }
}

async function applyViewport(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  viewport: Viewport
): Promise<boolean> {
  try {
    return (await instance.setViewport(viewport, { duration: 0 })) !== false
  } catch {
    return false
  }
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
