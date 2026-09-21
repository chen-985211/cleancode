import {
  advanceSpringAxis,
  isSpringAxisSettled,
  retargetSpringAxis,
  type SpringAxis
} from './motionSpring'

export interface MenuOptionHighlightMotionRoot {
  readonly style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
  readonly removeAttribute: (name: string) => unknown
  readonly setAttribute: (name: string, value: string) => unknown
}

export interface MenuOptionHighlightMotionFrameScheduler {
  readonly cancelFrame: (frameId: number) => void
  readonly now: () => number
  readonly requestFrame: (callback: FrameRequestCallback) => number
}

interface MenuOptionHighlightMotionControllerOptions {
  readonly scheduler?: MenuOptionHighlightMotionFrameScheduler
}

interface MenuOptionHighlightGeometry {
  readonly height: number
  readonly top: number
}

export interface MenuOptionHighlightMotionController {
  readonly dispose: () => void
  readonly hide: (root: MenuOptionHighlightMotionRoot) => void
  readonly moveTo: (
    root: MenuOptionHighlightMotionRoot,
    geometry: MenuOptionHighlightGeometry
  ) => void
  readonly setReducedMotion: (reducedMotion: boolean) => void
}

const heightProperty = '--cc-menu-option-highlight-height'
const yProperty = '--cc-menu-option-highlight-y'
const visibleAttribute = 'data-visible'
const motionStateAttribute = 'data-motion-state'
const targetYAttribute = 'data-target-y'
const springDynamics = { dampingRatio: 1, response: 0.22 }
const settlementThresholds = { speed: 0.4, value: 0.05 }

const browserFrameScheduler: MenuOptionHighlightMotionFrameScheduler = {
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

export function createMenuOptionHighlightMotionController({
  scheduler = browserFrameScheduler
}: MenuOptionHighlightMotionControllerOptions = {}): MenuOptionHighlightMotionController {
  let root: MenuOptionHighlightMotionRoot | null = null
  let axis: SpringAxis = { value: 0, velocity: 0 }
  let target = 0
  let initialized = false
  let visible = false
  let reducedMotion = false
  let animationFrameId: number | null = null
  let lastFrameTimestamp = scheduler.now()

  const cancelFrame = (): void => {
    if (animationFrameId !== null) scheduler.cancelFrame(animationFrameId)
    animationFrameId = null
  }

  const clearRoot = (): void => {
    if (!root) return
    root.style.removeProperty(heightProperty)
    root.style.removeProperty(yProperty)
    root.removeAttribute(visibleAttribute)
    root.removeAttribute(motionStateAttribute)
    root.removeAttribute(targetYAttribute)
    visible = false
  }

  const projectPosition = (): void => {
    root?.style.setProperty(yProperty, `${round(axis.value)}px`)
  }

  const present = (state: 'idle' | 'moving'): void => {
    if (!root) return
    projectPosition()
    root.setAttribute(visibleAttribute, 'true')
    root.setAttribute(motionStateAttribute, state)
    visible = true
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
    axis = advanceSpringAxis(axis, target, springDynamics, elapsedSeconds)

    if (isSpringAxisSettled(axis, target, settlementThresholds)) {
      axis = { value: target, velocity: 0 }
      if (visible) present('idle')
      else projectPosition()
      return
    }

    if (visible) present('moving')
    else projectPosition()
    scheduleFrame()
  }

  return {
    dispose: () => {
      cancelFrame()
      clearRoot()
      root = null
      initialized = false
    },
    hide: (currentRoot) => {
      if (currentRoot !== root) return
      root.removeAttribute(visibleAttribute)
      root.removeAttribute(motionStateAttribute)
      root.removeAttribute(targetYAttribute)
      visible = false
    },
    moveTo: (nextRoot, geometry) => {
      if (nextRoot !== root) {
        cancelFrame()
        clearRoot()
        root = nextRoot
        initialized = false
      }

      root.style.setProperty(heightProperty, `${round(geometry.height)}px`)
      root.setAttribute(targetYAttribute, `${round(geometry.top)}`)

      if (!initialized || reducedMotion) {
        cancelFrame()
        initialized = true
        target = geometry.top
        axis = { value: target, velocity: 0 }
        present('idle')
        return
      }

      if (geometry.top === target) {
        if (visible) return
        if (isSpringAxisSettled(axis, target, settlementThresholds)) {
          axis = { value: target, velocity: 0 }
          present('idle')
          return
        }
        present('moving')
        scheduleFrame()
        return
      }

      axis = retargetSpringAxis(axis, geometry.top, 'preserve')
      target = geometry.top
      present('moving')
      scheduleFrame()
    },
    setReducedMotion: (nextReducedMotion) => {
      reducedMotion = nextReducedMotion
      if (!reducedMotion || !initialized) return
      cancelFrame()
      axis = { value: target, velocity: 0 }
      if (visible) present('idle')
      else projectPosition()
    }
  }
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
