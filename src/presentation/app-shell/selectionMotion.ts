import {
  advanceSpringAxis,
  isSpringAxisSettled,
  retargetSpringAxis,
  type SpringAxis
} from './motionSpring'
import {
  createSpringProgressMotionController,
  type SpringProgressMotionFrameScheduler,
  type SpringProgressMotionRoot
} from './springProgressMotion'

export interface SelectionMotionTarget {
  readonly height: number
  readonly width: number
  readonly x: number
  readonly y: number
}

export interface SelectionIndicatorMotionRoot {
  readonly style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
  readonly removeAttribute: (name: string) => unknown
  readonly setAttribute: (name: string, value: string) => unknown
}

interface SelectionIndicatorMotionControllerOptions {
  readonly scheduler?: SpringProgressMotionFrameScheduler
}

interface SelectionMotionIntent {
  readonly reducedMotion: boolean
}

export interface SelectionIndicatorMotionController {
  readonly dispose: () => void
  readonly targetChanged: (
    root: SelectionIndicatorMotionRoot | null,
    target: SelectionMotionTarget,
    intent: SelectionMotionIntent
  ) => void
}

export interface SelectionFeedbackMotionController {
  readonly dispose: () => void
  readonly selectionChanged: (
    root: SpringProgressMotionRoot | null,
    selected: boolean,
    intent: SelectionMotionIntent
  ) => void
}

export const selectionMotionDynamics = { dampingRatio: 1, response: 0.24 } as const

const xProperty = '--cc-selection-motion-x'
const yProperty = '--cc-selection-motion-y'
const widthProperty = '--cc-selection-motion-width'
const heightProperty = '--cc-selection-motion-height'
const progressProperty = '--cc-selection-motion-progress'
const stateAttribute = 'data-selection-motion-state'
const positionThresholds = { speed: 0.02, value: 0.01 }
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

export function createSelectionIndicatorMotionController({
  scheduler = browserFrameScheduler
}: SelectionIndicatorMotionControllerOptions = {}): SelectionIndicatorMotionController {
  let root: SelectionIndicatorMotionRoot | null = null
  let target: SelectionMotionTarget | null = null
  let x: SpringAxis = { value: 0, velocity: 0 }
  let y: SpringAxis = { value: 0, velocity: 0 }
  let animationFrameId: number | null = null
  let lastFrameTimestamp = scheduler.now()

  const cancelFrame = (): void => {
    if (animationFrameId !== null) scheduler.cancelFrame(animationFrameId)
    animationFrameId = null
  }

  const scheduleFrame = (): void => {
    if (animationFrameId !== null) return
    lastFrameTimestamp = scheduler.now()
    animationFrameId = scheduler.requestFrame(advanceFrame)
  }

  const settled = (): boolean =>
    target !== null &&
    isSpringAxisSettled(x, target.x, positionThresholds) &&
    isSpringAxisSettled(y, target.y, positionThresholds)

  function advanceFrame(timestamp: number): void {
    animationFrameId = null
    if (!root || !target) return
    const elapsedSeconds = Math.max(0, (timestamp - lastFrameTimestamp) / 1000)
    lastFrameTimestamp = timestamp
    x = advanceSpringAxis(x, target.x, selectionMotionDynamics, elapsedSeconds)
    y = advanceSpringAxis(y, target.y, selectionMotionDynamics, elapsedSeconds)

    if (settled()) {
      x = { value: target.x, velocity: 0 }
      y = { value: target.y, velocity: 0 }
      presentIndicator(root, target, x, y, 'settled')
      return
    }

    presentIndicator(root, target, x, y, 'moving')
    scheduleFrame()
  }

  return {
    dispose: () => {
      cancelFrame()
      if (root) clearIndicator(root)
      root = null
      target = null
    },
    targetChanged: (nextRoot, nextTarget, intent) => {
      if (nextRoot !== root) {
        cancelFrame()
        if (root) clearIndicator(root)
        root = nextRoot
        target = null
      }
      if (!root) return

      if (!target || intent.reducedMotion) {
        cancelFrame()
        target = nextTarget
        x = { value: nextTarget.x, velocity: 0 }
        y = { value: nextTarget.y, velocity: 0 }
        presentIndicator(root, target, x, y, 'settled')
        return
      }

      x = retargetSpringAxis(x, nextTarget.x, 'toward-target-only')
      y = retargetSpringAxis(y, nextTarget.y, 'toward-target-only')
      target = nextTarget

      if (settled()) {
        cancelFrame()
        x = { value: nextTarget.x, velocity: 0 }
        y = { value: nextTarget.y, velocity: 0 }
        presentIndicator(root, target, x, y, 'settled')
        return
      }

      presentIndicator(root, target, x, y, 'moving')
      scheduleFrame()
    }
  }
}

export function createSelectionFeedbackMotionController({
  scheduler
}: SelectionIndicatorMotionControllerOptions = {}): SelectionFeedbackMotionController {
  const controller = createSpringProgressMotionController({
    clear: (root) => root.style.removeProperty(progressProperty),
    dynamics: selectionMotionDynamics,
    scheduler,
    stateAttribute
  })

  return {
    dispose: controller.dispose,
    selectionChanged: (root, selected, intent) => {
      controller.intentChanged(root, {
        onSettled: emptyCallback,
        present: (motionRoot, progress) => {
          motionRoot.style.setProperty(progressProperty, `${round(progress)}`)
        },
        reducedMotion: intent.reducedMotion,
        visible: selected
      })
    }
  }
}

function presentIndicator(
  root: SelectionIndicatorMotionRoot,
  target: SelectionMotionTarget,
  x: SpringAxis,
  y: SpringAxis,
  state: 'moving' | 'settled'
): void {
  root.style.setProperty(xProperty, `${round(x.value)}px`)
  root.style.setProperty(yProperty, `${round(y.value)}px`)
  root.style.setProperty(widthProperty, `${round(target.width)}px`)
  root.style.setProperty(heightProperty, `${round(target.height)}px`)
  root.setAttribute(stateAttribute, state)
}

function clearIndicator(root: SelectionIndicatorMotionRoot): void {
  root.style.removeProperty(xProperty)
  root.style.removeProperty(yProperty)
  root.style.removeProperty(widthProperty)
  root.style.removeProperty(heightProperty)
  root.removeAttribute(stateAttribute)
}

function emptyCallback(): void {}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
