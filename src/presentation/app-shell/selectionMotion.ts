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
  readonly animate?: Element['animate']
  readonly style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
  readonly removeAttribute: (name: string) => unknown
  readonly setAttribute: (name: string, value: string) => unknown
}

export interface SelectionIndicatorAnimationFrame {
  readonly offset: number
  readonly transform: string
}

export interface SelectionIndicatorAnimation {
  readonly cancel: () => void
  readonly finished: Promise<unknown>
}

export interface SelectionIndicatorAnimationDriver {
  readonly animate: (
    root: SelectionIndicatorMotionRoot,
    frames: readonly SelectionIndicatorAnimationFrame[],
    options: KeyframeAnimationOptions
  ) => SelectionIndicatorAnimation | null
}

interface SelectionIndicatorMotionControllerOptions {
  readonly animationDriver?: SelectionIndicatorAnimationDriver
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
const compositorSampleSeconds = 1 / 120
const maximumCompositorSampleCount = 240
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
const browserAnimationDriver: SelectionIndicatorAnimationDriver = {
  animate: (root, frames, options) => {
    if (!root.animate) return null
    const keyframes: Keyframe[] = frames.map(({ offset, transform }) => ({ offset, transform }))
    return root.animate.call(root, keyframes, options)
  }
}

export function createSelectionIndicatorMotionController({
  animationDriver = browserAnimationDriver,
  scheduler = browserFrameScheduler
}: SelectionIndicatorMotionControllerOptions = {}): SelectionIndicatorMotionController {
  let root: SelectionIndicatorMotionRoot | null = null
  let target: SelectionMotionTarget | null = null
  let x: SpringAxis = { value: 0, velocity: 0 }
  let y: SpringAxis = { value: 0, velocity: 0 }
  let activeAnimation: SelectionIndicatorAnimation | null = null
  let animationRevision = 0
  let animationFrameId: number | null = null
  let lastPresentationTimestamp = scheduler.now()

  const cancelFrame = (): void => {
    if (animationFrameId !== null) scheduler.cancelFrame(animationFrameId)
    animationFrameId = null
  }

  const cancelActiveAnimation = (): void => {
    animationRevision += 1
    const animation = activeAnimation
    activeAnimation = null
    animation?.cancel()
  }

  const cancelMotion = (): void => {
    cancelFrame()
    cancelActiveAnimation()
  }

  const scheduleFrame = (): void => {
    if (animationFrameId !== null) return
    animationFrameId = scheduler.requestFrame(advanceFrame)
  }

  const settled = (): boolean =>
    target !== null &&
    isSpringAxisSettled(x, target.x, positionThresholds) &&
    isSpringAxisSettled(y, target.y, positionThresholds)

  const advancePresentation = (timestamp: number): void => {
    if (!target) return
    const elapsedSeconds = Math.max(0, (timestamp - lastPresentationTimestamp) / 1000)
    lastPresentationTimestamp = timestamp
    x = advanceSpringAxis(x, target.x, selectionMotionDynamics, elapsedSeconds)
    y = advanceSpringAxis(y, target.y, selectionMotionDynamics, elapsedSeconds)

    if (!settled()) return
    x = { value: target.x, velocity: 0 }
    y = { value: target.y, velocity: 0 }
  }

  function advanceFrame(timestamp: number): void {
    animationFrameId = null
    if (!root || !target) return
    advancePresentation(timestamp)

    if (settled()) {
      presentIndicator(root, target, x, y, 'settled')
      return
    }

    presentIndicator(root, target, x, y, 'moving')
    scheduleFrame()
  }

  const beginMotion = (): void => {
    if (!root || !target) return
    presentIndicator(root, target, x, y, 'moving')
    const sampled = sampleSelectionIndicatorMotion(x, y, target)
    let animation: SelectionIndicatorAnimation | null = null

    try {
      animation = animationDriver.animate(root, sampled.frames, {
        duration: sampled.durationMilliseconds,
        easing: 'linear',
        fill: 'both'
      })
    } catch {
      animation = null
    }

    lastPresentationTimestamp = scheduler.now()
    if (!animation) {
      scheduleFrame()
      return
    }

    activeAnimation = animation
    animationRevision += 1
    const revision = animationRevision
    void animation.finished.then(
      () => {
        if (activeAnimation !== animation || animationRevision !== revision || !root || !target) {
          return
        }

        activeAnimation = null
        x = { value: target.x, velocity: 0 }
        y = { value: target.y, velocity: 0 }
        presentIndicator(root, target, x, y, 'settled')
        animation.cancel()
      },
      () => {
        if (activeAnimation !== animation || animationRevision !== revision || !root || !target) {
          return
        }

        activeAnimation = null
        advancePresentation(scheduler.now())
        if (settled()) {
          presentIndicator(root, target, x, y, 'settled')
          return
        }
        presentIndicator(root, target, x, y, 'moving')
        scheduleFrame()
      }
    )
  }

  return {
    dispose: () => {
      cancelMotion()
      if (root) clearIndicator(root)
      root = null
      target = null
    },
    targetChanged: (nextRoot, nextTarget, intent) => {
      if (nextRoot !== root) {
        cancelMotion()
        if (root) clearIndicator(root)
        root = nextRoot
        target = null
      }
      if (!root) return

      if (!target || intent.reducedMotion) {
        cancelMotion()
        target = nextTarget
        x = { value: nextTarget.x, velocity: 0 }
        y = { value: nextTarget.y, velocity: 0 }
        lastPresentationTimestamp = scheduler.now()
        presentIndicator(root, target, x, y, 'settled')
        return
      }

      const retargetTimestamp = scheduler.now()
      advancePresentation(retargetTimestamp)
      cancelMotion()
      x = retargetSpringAxis(x, nextTarget.x, 'toward-target-only')
      y = retargetSpringAxis(y, nextTarget.y, 'toward-target-only')
      target = nextTarget
      lastPresentationTimestamp = retargetTimestamp

      if (settled()) {
        x = { value: nextTarget.x, velocity: 0 }
        y = { value: nextTarget.y, velocity: 0 }
        presentIndicator(root, target, x, y, 'settled')
        return
      }

      beginMotion()
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

function sampleSelectionIndicatorMotion(
  initialX: SpringAxis,
  initialY: SpringAxis,
  target: SelectionMotionTarget
): {
  readonly durationMilliseconds: number
  readonly frames: readonly SelectionIndicatorAnimationFrame[]
} {
  let sampledX = initialX
  let sampledY = initialY
  const positions: { readonly x: number; readonly y: number }[] = [
    { x: initialX.value, y: initialY.value }
  ]

  for (let sample = 0; sample < maximumCompositorSampleCount; sample += 1) {
    sampledX = advanceSpringAxis(
      sampledX,
      target.x,
      selectionMotionDynamics,
      compositorSampleSeconds
    )
    sampledY = advanceSpringAxis(
      sampledY,
      target.y,
      selectionMotionDynamics,
      compositorSampleSeconds
    )
    const hasSettled =
      isSpringAxisSettled(sampledX, target.x, positionThresholds) &&
      isSpringAxisSettled(sampledY, target.y, positionThresholds)
    positions.push(hasSettled ? { x: target.x, y: target.y } : sampledPosition(sampledX, sampledY))
    if (hasSettled) break
  }

  const finalPosition = positions.at(-1)
  if (finalPosition?.x !== target.x || finalPosition.y !== target.y) {
    positions.push({ x: target.x, y: target.y })
  }

  const intervalCount = positions.length - 1
  return {
    durationMilliseconds: intervalCount * compositorSampleSeconds * 1000,
    frames: positions.map((position, index) => ({
      offset: intervalCount === 0 ? 1 : index / intervalCount,
      transform: toSelectionIndicatorTransform(position.x, position.y)
    }))
  }
}

function sampledPosition(x: SpringAxis, y: SpringAxis): { readonly x: number; readonly y: number } {
  return { x: x.value, y: y.value }
}

function toSelectionIndicatorTransform(x: number, y: number): string {
  return `translate3d(${round(x)}px, ${round(y)}px, 0)`
}

function emptyCallback(): void {}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
