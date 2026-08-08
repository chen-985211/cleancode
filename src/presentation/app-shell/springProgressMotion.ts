import {
  advanceSpringAxis,
  isSpringAxisSettled,
  retargetSpringAxis,
  type SpringAxis,
  type SpringDynamics,
  type SpringRetargetPolicy,
  type SpringSettlementThresholds
} from './motionSpring'

export interface SpringProgressMotionRoot {
  readonly style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
  readonly removeAttribute: (name: string) => unknown
  readonly setAttribute: (name: string, value: string) => unknown
}

export interface SpringProgressMotionFrameScheduler {
  readonly cancelFrame: (frameId: number) => void
  readonly now: () => number
  readonly requestFrame: (callback: FrameRequestCallback) => number
}

type SpringProgressMotionState = 'closed' | 'closing' | 'open' | 'opening'

interface SpringProgressMotionIntent {
  readonly onSettled: () => void
  readonly present: (
    root: SpringProgressMotionRoot,
    progress: number,
    state: SpringProgressMotionState
  ) => void
  readonly reducedMotion: boolean
  readonly visible: boolean
}

interface SpringProgressMotionControllerOptions {
  readonly clear: (root: SpringProgressMotionRoot) => void
  readonly dynamics: SpringDynamics
  readonly retargetPolicy?: SpringRetargetPolicy
  readonly scheduler?: SpringProgressMotionFrameScheduler
  readonly settlementThresholds?: SpringSettlementThresholds
  readonly stateAttribute: string
}

export interface SpringProgressMotionController {
  readonly dispose: () => void
  readonly intentChanged: (
    root: SpringProgressMotionRoot | null,
    intent: SpringProgressMotionIntent
  ) => void
}

const defaultSettlementThresholds = { speed: 0.002, value: 0.0002 }

const browserFrameScheduler: SpringProgressMotionFrameScheduler = {
  cancelFrame: (frameId) => {
    if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frameId)
    else window.clearTimeout(frameId)
  },
  now: () => window.performance.now(),
  requestFrame: (callback) => {
    if (typeof window.requestAnimationFrame === 'function') {
      return window.requestAnimationFrame(callback)
    }
    return window.setTimeout(() => callback(window.performance.now()), 1000 / 60)
  }
}

export function createSpringProgressMotionController({
  clear,
  dynamics,
  retargetPolicy = 'toward-target-only',
  scheduler = browserFrameScheduler,
  settlementThresholds = defaultSettlementThresholds,
  stateAttribute
}: SpringProgressMotionControllerOptions): SpringProgressMotionController {
  let root: SpringProgressMotionRoot | null = null
  let axis: SpringAxis = { value: 0, velocity: 0 }
  let target = 0
  let onSettled = (): void => undefined
  let present: SpringProgressMotionIntent['present'] = (): void => undefined
  let animationFrameId: number | null = null
  let lastFrameTimestamp = scheduler.now()

  const cancelFrame = (): void => {
    if (animationFrameId !== null) scheduler.cancelFrame(animationFrameId)
    animationFrameId = null
  }

  const clearRoot = (): void => {
    if (!root) return
    clear(root)
    root.removeAttribute(stateAttribute)
  }

  const presentState = (state: SpringProgressMotionState): void => {
    if (!root) return
    const progress = clamp(axis.value, 0, 1)
    present(root, progress, state)
    root.setAttribute(stateAttribute, state)
  }

  const scheduleFrame = (): void => {
    if (animationFrameId !== null) return
    lastFrameTimestamp = scheduler.now()
    animationFrameId = scheduler.requestFrame(advanceFrame)
  }

  function advanceFrame(timestamp: number): void {
    animationFrameId = null
    const elapsedSeconds = Math.max(0, (timestamp - lastFrameTimestamp) / 1000)
    lastFrameTimestamp = timestamp
    axis = advanceSpringAxis(axis, target, dynamics, elapsedSeconds)

    if (isSpringAxisSettled(axis, target, settlementThresholds)) {
      axis = { value: target, velocity: 0 }
      presentState(target === 0 ? 'closed' : 'open')
      onSettled()
      return
    }

    presentState(target === 0 ? 'closing' : 'opening')
    scheduleFrame()
  }

  return {
    dispose: () => {
      cancelFrame()
      clearRoot()
      root = null
    },
    intentChanged: (nextRoot, intent) => {
      const nextTarget = intent.visible ? 1 : 0
      onSettled = intent.onSettled
      present = intent.present

      if (nextRoot !== root) {
        cancelFrame()
        clearRoot()
        root = nextRoot
        target = nextTarget
        axis = {
          value: intent.visible && !intent.reducedMotion ? 0 : nextTarget,
          velocity: 0
        }
        if (!root) return

        if (intent.visible && !intent.reducedMotion) {
          presentState('opening')
          scheduleFrame()
        } else {
          presentState(nextTarget === 0 ? 'closed' : 'open')
          if (intent.reducedMotion) onSettled()
        }
        return
      }

      if (!root) return

      if (intent.reducedMotion) {
        cancelFrame()
        target = nextTarget
        axis = { value: target, velocity: 0 }
        presentState(target === 0 ? 'closed' : 'open')
        onSettled()
        return
      }

      if (nextTarget === target) {
        presentState(
          animationFrameId === null
            ? target === 0
              ? 'closed'
              : 'open'
            : target === 0
              ? 'closing'
              : 'opening'
        )
        return
      }

      axis = retargetSpringAxis(axis, nextTarget, retargetPolicy)
      target = nextTarget
      presentState(target === 0 ? 'closing' : 'opening')
      scheduleFrame()
    }
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
