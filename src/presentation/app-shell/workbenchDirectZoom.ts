import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'

import {
  maximumCanvasZoom,
  minimumCanvasZoom
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchFlowNode } from './types'
import {
  browserViewportMotionFrameScheduler,
  type WorkbenchViewportMotionFrameScheduler
} from './workbenchViewportMotionEnvironment'
import {
  advanceCriticalSpringAxis,
  isCriticalSpringAxisSettled,
  type CriticalSpringAxis
} from './workbenchViewportSpring'

export interface WorkbenchDirectZoomCompletion {
  readonly viewport: Viewport
}

export type WorkbenchDirectZoomCompletionListener = (
  completion: WorkbenchDirectZoomCompletion
) => void

export type WorkbenchDirectZoomPresentationListener = (viewport: Viewport) => void

export interface WorkbenchDirectZoomInput {
  readonly anchor: { readonly x: number; readonly y: number }
  readonly deltaZoomStops: number
  readonly reducedMotion: boolean
}

export interface WorkbenchDirectZoomController {
  readonly cancel: (instance?: ReactFlowInstance<WorkbenchFlowNode, Edge>) => void
  readonly retarget: (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    input: WorkbenchDirectZoomInput
  ) => boolean
  readonly subscribe: (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    listener: WorkbenchDirectZoomCompletionListener
  ) => () => void
  readonly subscribePresentation: (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    listener: WorkbenchDirectZoomPresentationListener
  ) => () => void
}

interface DirectZoomAnchor {
  readonly screenX: number
  readonly screenY: number
  readonly worldX: number
  readonly worldY: number
}

interface ActiveDirectZoom {
  anchor: DirectZoomAnchor
  deadlineId: number | null
  frameId: number | null
  idle: boolean
  idleTimeoutId: number | null
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  lastTimestamp: number
  presentation: Viewport
  reducedMotion: boolean
  requestId: number
  target: Viewport
  targetZoomStops: number
  zoomStops: CriticalSpringAxis
}

const directZoomResponse = 0.065
const directZoomIdleMilliseconds = 150
const maximumDirectZoomRuntime = 600
const zoomValueSettlement = 0.000_2
const zoomSpeedSettlement = 0.002

export function createWorkbenchDirectZoomController(
  scheduler: WorkbenchViewportMotionFrameScheduler
): WorkbenchDirectZoomController {
  let activeMotion: ActiveDirectZoom | null = null
  let latestRequest: {
    readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
    readonly requestId: number
  } | null = null
  let nextRequestId = 1
  const completionListeners = new WeakMap<
    ReactFlowInstance<WorkbenchFlowNode, Edge>,
    Set<WorkbenchDirectZoomCompletionListener>
  >()
  const presentationListeners = new WeakMap<
    ReactFlowInstance<WorkbenchFlowNode, Edge>,
    Set<WorkbenchDirectZoomPresentationListener>
  >()

  const cancelMotionSchedule = (motion: ActiveDirectZoom): void => {
    if (motion.frameId !== null) {
      scheduler.cancelFrame(motion.frameId)
      motion.frameId = null
    }
    if (motion.idleTimeoutId !== null) {
      scheduler.cancelTimeout(motion.idleTimeoutId)
      motion.idleTimeoutId = null
    }
    if (motion.deadlineId !== null) {
      scheduler.cancelTimeout(motion.deadlineId)
      motion.deadlineId = null
    }
  }

  const cancel = (instance?: ReactFlowInstance<WorkbenchFlowNode, Edge>): void => {
    if (activeMotion && (!instance || activeMotion.instance === instance)) {
      cancelMotionSchedule(activeMotion)
      activeMotion = null
    }
    if (latestRequest && (!instance || latestRequest.instance === instance)) {
      latestRequest = null
    }
  }

  const subscribe = (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    listener: WorkbenchDirectZoomCompletionListener
  ): (() => void) => {
    const listeners = completionListeners.get(instance) ?? new Set()
    listeners.add(listener)
    completionListeners.set(instance, listeners)

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) completionListeners.delete(instance)
    }
  }

  const subscribePresentation = (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    listener: WorkbenchDirectZoomPresentationListener
  ): (() => void) => {
    const listeners = presentationListeners.get(instance) ?? new Set()
    listeners.add(listener)
    presentationListeners.set(instance, listeners)

    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) presentationListeners.delete(instance)
    }
  }

  const isLatestRequest = (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    requestId: number
  ): boolean => latestRequest?.instance === instance && latestRequest.requestId === requestId

  const applyPresentation = (motion: ActiveDirectZoom, viewport: Viewport): Promise<boolean> => {
    const requestId = motion.requestId
    return applyViewport(motion.instance, viewport).then((applied) => {
      if (applied && isLatestRequest(motion.instance, requestId)) {
        presentationListeners.get(motion.instance)?.forEach((listener) => listener(viewport))
      }
      return applied
    })
  }

  const finishMotion = (motion: ActiveDirectZoom): void => {
    if (activeMotion !== motion || !isLatestRequest(motion.instance, motion.requestId)) return

    cancelMotionSchedule(motion)
    activeMotion = null
    void applyPresentation(motion, motion.target).then((applied) => {
      if (!applied || !isLatestRequest(motion.instance, motion.requestId)) return
      latestRequest = null
      completionListeners
        .get(motion.instance)
        ?.forEach((listener) => listener({ viewport: motion.target }))
    })
  }

  const scheduleNextFrame = (motion: ActiveDirectZoom): void => {
    if (activeMotion !== motion || motion.frameId !== null || motion.reducedMotion) return
    motion.frameId = scheduler.requestFrame(advanceMotion)
  }

  const isMotionSettled = (motion: ActiveDirectZoom): boolean => {
    const targetZoom = motion.target.zoom
    return isCriticalSpringAxisSettled(motion.zoomStops, motion.targetZoomStops, {
      speed: zoomSpeedSettlement / (targetZoom * Math.LN2),
      value: zoomValueSettlement / (targetZoom * Math.LN2)
    })
  }

  const advanceMotion = (timestamp: number): void => {
    const motion = activeMotion
    if (!motion) return

    motion.frameId = null
    const deltaSeconds = Math.max(0, (timestamp - motion.lastTimestamp) / 1_000)
    motion.lastTimestamp = timestamp
    motion.zoomStops = advanceCriticalSpringAxis(
      motion.zoomStops,
      motion.targetZoomStops,
      directZoomResponse,
      deltaSeconds
    )
    motion.presentation = resolveAnchoredViewport(motion.anchor, 2 ** motion.zoomStops.value)
    void applyPresentation(motion, motion.presentation)

    if (isMotionSettled(motion)) {
      if (motion.idle) finishMotion(motion)
      return
    }
    scheduleNextFrame(motion)
  }

  const scheduleGestureEnd = (motion: ActiveDirectZoom): void => {
    if (motion.idleTimeoutId !== null) scheduler.cancelTimeout(motion.idleTimeoutId)
    if (motion.deadlineId !== null) scheduler.cancelTimeout(motion.deadlineId)

    motion.idleTimeoutId = scheduler.requestTimeout(() => {
      if (activeMotion !== motion) return
      motion.idleTimeoutId = null
      motion.idle = true
      if (motion.reducedMotion || isMotionSettled(motion)) {
        finishMotion(motion)
      } else {
        scheduleNextFrame(motion)
      }
    }, directZoomIdleMilliseconds)
    motion.deadlineId = scheduler.requestTimeout(() => {
      if (activeMotion !== motion) return
      motion.deadlineId = null
      finishMotion(motion)
    }, directZoomIdleMilliseconds + maximumDirectZoomRuntime)
  }

  const retarget = (
    instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    input: WorkbenchDirectZoomInput
  ): boolean => {
    const continuingMotion = activeMotion?.instance === instance ? activeMotion : null
    const started = !continuingMotion
    const restartFrameClock = !continuingMotion || continuingMotion.frameId === null
    const now = scheduler.now()
    const currentViewport = continuingMotion?.presentation ?? instance.getViewport()
    const currentZoomStops = Math.log2(currentViewport.zoom)
    const baseTargetZoomStops = continuingMotion?.targetZoomStops ?? currentZoomStops
    const targetZoomStops = clampZoomStops(baseTargetZoomStops + input.deltaZoomStops)
    const anchor = resolveDirectZoomAnchor(currentViewport, input.anchor)
    const target = resolveAnchoredViewport(anchor, 2 ** targetZoomStops)
    const requestId = nextRequestId
    nextRequestId += 1

    if (!continuingMotion) cancel()

    const motion: ActiveDirectZoom = continuingMotion ?? {
      anchor,
      deadlineId: null,
      frameId: null,
      idle: false,
      idleTimeoutId: null,
      instance,
      lastTimestamp: now,
      presentation: currentViewport,
      reducedMotion: input.reducedMotion,
      requestId,
      target,
      targetZoomStops,
      zoomStops: { value: currentZoomStops, velocity: 0 }
    }

    motion.anchor = anchor
    motion.idle = false
    if (restartFrameClock) motion.lastTimestamp = now
    motion.presentation = currentViewport
    motion.reducedMotion = input.reducedMotion
    motion.requestId = requestId
    motion.target = target
    motion.targetZoomStops = targetZoomStops
    motion.zoomStops = { ...motion.zoomStops, value: currentZoomStops }
    activeMotion = motion
    latestRequest = { instance, requestId }

    if (input.reducedMotion) {
      if (motion.frameId !== null) {
        scheduler.cancelFrame(motion.frameId)
        motion.frameId = null
      }
      motion.presentation = target
      motion.zoomStops = { value: targetZoomStops, velocity: 0 }
      void applyPresentation(motion, target)
    } else {
      scheduleNextFrame(motion)
    }
    scheduleGestureEnd(motion)

    return started
  }

  return { cancel, retarget, subscribe, subscribePresentation }
}

function resolveDirectZoomAnchor(
  viewport: Viewport,
  screen: { readonly x: number; readonly y: number }
): DirectZoomAnchor {
  return {
    screenX: screen.x,
    screenY: screen.y,
    worldX: (screen.x - viewport.x) / viewport.zoom,
    worldY: (screen.y - viewport.y) / viewport.zoom
  }
}

function resolveAnchoredViewport(anchor: DirectZoomAnchor, zoom: number): Viewport {
  return {
    x: anchor.screenX - anchor.worldX * zoom,
    y: anchor.screenY - anchor.worldY * zoom,
    zoom
  }
}

function clampZoomStops(zoomStops: number): number {
  return Math.min(Math.log2(maximumCanvasZoom), Math.max(Math.log2(minimumCanvasZoom), zoomStops))
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

const browserDirectZoomController = createWorkbenchDirectZoomController(
  browserViewportMotionFrameScheduler
)

export function retargetWorkbenchDirectZoom(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  input: WorkbenchDirectZoomInput
): boolean {
  return browserDirectZoomController.retarget(instance, input)
}

export function cancelWorkbenchDirectZoom(
  instance?: ReactFlowInstance<WorkbenchFlowNode, Edge>
): void {
  browserDirectZoomController.cancel(instance)
}

export function subscribeWorkbenchDirectZoomCompletion(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  listener: WorkbenchDirectZoomCompletionListener
): () => void {
  return browserDirectZoomController.subscribe(instance, listener)
}

export function subscribeWorkbenchDirectZoomPresentation(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  listener: WorkbenchDirectZoomPresentationListener
): () => void {
  return browserDirectZoomController.subscribePresentation(instance, listener)
}
