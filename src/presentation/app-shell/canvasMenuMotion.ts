import {
  advanceCriticalSpringAxis,
  isCriticalSpringAxisSettled,
  type CriticalSpringAxis
} from './workbenchViewportSpring'
import { retargetSpringAxis } from '../shared/motion/motionSpring'

type CanvasMenuMotionPhase = 'closed' | 'closing' | 'open' | 'opening'

export interface CanvasMenuMotionPresentation {
  readonly phase: CanvasMenuMotionPhase
  readonly progress: number
  readonly velocity: number
}

export interface CanvasMenuMotionFrameScheduler {
  readonly cancelFrame: (frameId: number) => void
  readonly cancelTimeout: (timeoutId: number) => void
  readonly now: () => number
  readonly requestFrame: (callback: FrameRequestCallback) => number
  readonly requestTimeout: (callback: () => void, delayMilliseconds: number) => number
}

interface CanvasMenuMotionControllerOptions {
  readonly onPresent: (presentation: CanvasMenuMotionPresentation) => void
  readonly reducedMotion?: boolean
  readonly scheduler?: CanvasMenuMotionFrameScheduler
}

export interface CanvasMenuMotionController {
  readonly dispose: () => void
  readonly reset: () => void
  readonly setReducedMotion: (reducedMotion: boolean) => void
  readonly setOpen: (open: boolean) => Promise<boolean>
}

interface ActiveMotionRequest {
  readonly open: boolean
  readonly promise: Promise<boolean>
  readonly requestId: number
  readonly resolve: (completed: boolean) => void
}

const springResponse = 0.4
const maximumSpringRuntimeMilliseconds = 900
const settlementThresholds = { speed: 0.01, value: 0.001 }

const browserFrameScheduler: CanvasMenuMotionFrameScheduler = {
  cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
  cancelTimeout: (timeoutId) => window.clearTimeout(timeoutId),
  now: () => window.performance.now(),
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  requestTimeout: (callback, delayMilliseconds) => window.setTimeout(callback, delayMilliseconds)
}

export function createCanvasMenuMotionController({
  onPresent,
  reducedMotion = false,
  scheduler = browserFrameScheduler
}: CanvasMenuMotionControllerOptions): CanvasMenuMotionController {
  let activeRequest: ActiveMotionRequest | null = null
  let axis: CriticalSpringAxis = { value: 0, velocity: 0 }
  let frameId: number | null = null
  let lastTimestamp = scheduler.now()
  let nextRequestId = 1
  let phase: CanvasMenuMotionPhase = 'closed'
  let prefersReducedMotion = reducedMotion
  let timeoutId: number | null = null

  const present = (): void => {
    onPresent({
      phase,
      progress: clamp(axis.value, 0, 1),
      velocity: axis.velocity
    })
  }

  const cancelSchedule = (): void => {
    if (frameId !== null) scheduler.cancelFrame(frameId)
    if (timeoutId !== null) scheduler.cancelTimeout(timeoutId)
    frameId = null
    timeoutId = null
  }

  const invalidateActiveRequest = (): void => {
    activeRequest?.resolve(false)
    activeRequest = null
  }

  const finish = (requestId: number): void => {
    if (activeRequest?.requestId !== requestId) return
    const completedRequest = activeRequest
    const target = completedRequest.open ? 1 : 0

    cancelSchedule()
    axis = { value: target, velocity: 0 }
    phase = completedRequest.open ? 'open' : 'closed'
    activeRequest = null
    present()
    completedRequest.resolve(true)
  }

  const scheduleFrame = (): void => {
    if (frameId !== null) return
    frameId = scheduler.requestFrame(advanceFrame)
  }

  const advanceFrame = (timestamp: number): void => {
    frameId = null
    const request = activeRequest
    if (!request) return

    const deltaSeconds = Math.max(0, (timestamp - lastTimestamp) / 1_000)
    lastTimestamp = timestamp
    const target = request.open ? 1 : 0
    axis = advanceCriticalSpringAxis(axis, target, springResponse, deltaSeconds)
    present()

    if (isCriticalSpringAxisSettled(axis, target, settlementThresholds)) {
      finish(request.requestId)
      return
    }
    scheduleFrame()
  }

  const reset = (): void => {
    cancelSchedule()
    invalidateActiveRequest()
    axis = { value: 0, velocity: 0 }
    phase = 'closed'
    present()
  }

  return {
    dispose: reset,
    reset,
    setReducedMotion: (nextReducedMotion) => {
      if (prefersReducedMotion === nextReducedMotion) return
      prefersReducedMotion = nextReducedMotion
      if (nextReducedMotion && activeRequest) finish(activeRequest.requestId)
    },
    setOpen: (open) => {
      if (activeRequest?.open === open) return activeRequest.promise
      if (!activeRequest && phase === (open ? 'open' : 'closed')) return Promise.resolve(true)

      cancelSchedule()
      invalidateActiveRequest()
      const requestId = nextRequestId++
      phase = open ? 'opening' : 'closing'
      axis = retargetSpringAxis(axis, open ? 1 : 0, 'toward-target-only')

      if (prefersReducedMotion) {
        axis = { value: open ? 1 : 0, velocity: 0 }
        phase = open ? 'open' : 'closed'
        present()
        return Promise.resolve(true)
      }

      let resolveRequest: (completed: boolean) => void = () => undefined
      const promise = new Promise<boolean>((resolve) => {
        resolveRequest = resolve
      })
      activeRequest = { open, promise, requestId, resolve: resolveRequest }
      lastTimestamp = scheduler.now()
      present()
      scheduleFrame()
      timeoutId = scheduler.requestTimeout(
        () => finish(requestId),
        maximumSpringRuntimeMilliseconds
      )
      return promise
    }
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}
