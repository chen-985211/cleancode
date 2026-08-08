export interface WorkbenchViewportMotionFrameScheduler {
  readonly cancelFrame: (frameId: number) => void
  readonly cancelTimeout: (timeoutId: number) => void
  readonly now: () => number
  readonly requestFrame: (callback: FrameRequestCallback) => number
  readonly requestTimeout: (callback: () => void, delayMilliseconds: number) => number
}

export const browserViewportMotionFrameScheduler: WorkbenchViewportMotionFrameScheduler = {
  cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
  cancelTimeout: (timeoutId) => window.clearTimeout(timeoutId),
  now: () => window.performance.now(),
  requestFrame: (callback) => window.requestAnimationFrame(callback),
  requestTimeout: (callback, delayMilliseconds) => window.setTimeout(callback, delayMilliseconds)
}

export { prefersReducedMotion } from './motionPreference'
