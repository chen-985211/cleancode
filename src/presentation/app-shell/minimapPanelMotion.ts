import {
  advanceSpringAxis,
  isSpringAxisSettled,
  retargetSpringAxis,
  type SpringAxis
} from '../shared/motion/motionSpring'

export interface MinimapPanelMotionRoot {
  readonly style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
  readonly removeAttribute: (name: string) => unknown
  readonly setAttribute: (name: string, value: string) => unknown
}

export interface MinimapPanelMotionFrameScheduler {
  readonly cancelFrame: (frameId: number) => void
  readonly now: () => number
  readonly requestFrame: (callback: FrameRequestCallback) => number
}

interface MinimapPanelMotionIntent {
  readonly expanded: boolean
  readonly onSettled: () => void
  readonly reducedMotion: boolean
}

interface MinimapPanelMotionControllerOptions {
  readonly scheduler?: MinimapPanelMotionFrameScheduler
}

export interface MinimapPanelMotionController {
  readonly dispose: () => void
  readonly intentChanged: (
    root: MinimapPanelMotionRoot | null,
    intent: MinimapPanelMotionIntent
  ) => void
}

const panelHeightProperty = '--canvas-minimap-panel-height'
const panelGapProperty = '--canvas-minimap-panel-gap'
const panelOpacityProperty = '--canvas-minimap-panel-opacity'
const toggleRotationProperty = '--canvas-minimap-toggle-rotation'
const stateAttribute = 'data-canvas-minimap-motion-state'
const panelHeight = 120
const panelGap = 6
const springDynamics = { dampingRatio: 1, response: 0.32 }
const settlementThresholds = { speed: 0.002, value: 0.0002 }

const browserFrameScheduler: MinimapPanelMotionFrameScheduler = {
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

export function createMinimapPanelMotionController({
  scheduler = browserFrameScheduler
}: MinimapPanelMotionControllerOptions = {}): MinimapPanelMotionController {
  let root: MinimapPanelMotionRoot | null = null
  let axis: SpringAxis = { value: 0, velocity: 0 }
  let target = 0
  let onSettled = (): void => undefined
  let animationFrameId: number | null = null
  let lastFrameTimestamp = scheduler.now()

  const cancelFrame = (): void => {
    if (animationFrameId !== null) scheduler.cancelFrame(animationFrameId)
    animationFrameId = null
  }

  const clearRoot = (): void => {
    if (!root) return
    root.style.removeProperty(panelHeightProperty)
    root.style.removeProperty(panelGapProperty)
    root.style.removeProperty(panelOpacityProperty)
    root.style.removeProperty(toggleRotationProperty)
    root.removeAttribute(stateAttribute)
  }

  const present = (state: 'collapsed' | 'closing' | 'expanded' | 'opening'): void => {
    if (!root) return
    const progress = clamp(axis.value, 0, 1)
    root.style.setProperty(panelHeightProperty, `${round(progress * panelHeight)}px`)
    root.style.setProperty(panelGapProperty, `${round(progress * panelGap)}px`)
    root.style.setProperty(panelOpacityProperty, `${round(progress)}`)
    root.style.setProperty(toggleRotationProperty, `${round(progress * 180)}deg`)
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
    axis = advanceSpringAxis(axis, target, springDynamics, elapsedSeconds)

    if (isSpringAxisSettled(axis, target, settlementThresholds)) {
      axis = { value: target, velocity: 0 }
      present(target === 0 ? 'collapsed' : 'expanded')
      onSettled()
      return
    }

    present(target === 0 ? 'closing' : 'opening')
    scheduleFrame()
  }

  return {
    dispose: () => {
      cancelFrame()
      clearRoot()
      root = null
    },
    intentChanged: (nextRoot, intent) => {
      const nextTarget = intent.expanded ? 1 : 0
      onSettled = intent.onSettled

      if (nextRoot !== root) {
        cancelFrame()
        clearRoot()
        root = nextRoot
        target = nextTarget
        axis = { value: intent.expanded && !intent.reducedMotion ? 0 : target, velocity: 0 }
        present(axis.value === 0 ? 'collapsed' : 'expanded')
        if (intent.expanded && !intent.reducedMotion) {
          present('opening')
          scheduleFrame()
        } else if (intent.reducedMotion) {
          onSettled()
        }
        return
      }

      if (!root) return

      if (intent.reducedMotion) {
        cancelFrame()
        target = nextTarget
        axis = { value: target, velocity: 0 }
        present(target === 0 ? 'collapsed' : 'expanded')
        onSettled()
        return
      }

      if (nextTarget === target) return

      axis = retargetSpringAxis(axis, nextTarget, 'toward-target-only')
      target = nextTarget
      present(target === 0 ? 'closing' : 'opening')
      scheduleFrame()
    }
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
