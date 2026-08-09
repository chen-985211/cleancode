import {
  advanceSpringAxis,
  isSpringAxisSettled,
  retargetSpringAxis,
  type SpringAxis
} from './motionSpring'

export interface ProjectSidebarMotionRoot {
  readonly style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
  readonly removeAttribute: (name: string) => unknown
  readonly setAttribute: (name: string, value: string) => unknown
}

export interface ProjectSidebarMotionFrameScheduler {
  readonly cancelFrame: (frameId: number) => void
  readonly now: () => number
  readonly requestFrame: (callback: FrameRequestCallback) => number
}

interface ProjectSidebarMotionIntent {
  readonly expandedWidth: number
  readonly isCollapsed: boolean
  readonly reducedMotion: boolean
}

interface ProjectSidebarMotionControllerOptions {
  readonly scheduler?: ProjectSidebarMotionFrameScheduler
}

export interface ProjectSidebarMotionController {
  readonly dispose: () => void
  readonly intentChanged: (
    root: ProjectSidebarMotionRoot | null,
    intent: ProjectSidebarMotionIntent
  ) => void
}

const widthProperty = '--cc-sidebar-motion-width'
const offsetProperty = '--cc-sidebar-motion-offset'
const stateAttribute = 'data-project-sidebar-motion-state'
const springDynamics = { dampingRatio: 0.78, response: 0.42 }
const settlementThresholds = { speed: 0.001, value: 0.0001 }
const surfaceProgressBounds = { maximum: 1.025, minimum: -0.025 }

const browserFrameScheduler: ProjectSidebarMotionFrameScheduler = {
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

export function createProjectSidebarMotionController({
  scheduler = browserFrameScheduler
}: ProjectSidebarMotionControllerOptions = {}): ProjectSidebarMotionController {
  let root: ProjectSidebarMotionRoot | null = null
  let axis: SpringAxis = { value: 1, velocity: 0 }
  let target = 1
  let expandedWidth = 280
  let animationFrameId: number | null = null
  let lastFrameTimestamp = scheduler.now()

  const cancelFrame = (): void => {
    if (animationFrameId !== null) scheduler.cancelFrame(animationFrameId)
    animationFrameId = null
  }

  const present = (state: 'collapsed' | 'closing' | 'expanded' | 'opening'): void => {
    if (!root) return
    const layoutProgress = clamp(axis.value, 0, 1)
    const surfaceProgress = clamp(
      axis.value,
      surfaceProgressBounds.minimum,
      surfaceProgressBounds.maximum
    )
    root.style.setProperty(widthProperty, `${round(expandedWidth * layoutProgress)}px`)
    root.style.setProperty(offsetProperty, `${round((surfaceProgress - 1) * 100)}%`)
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
      return
    }

    present(target === 0 ? 'closing' : 'opening')
    scheduleFrame()
  }

  const clearRoot = (): void => {
    if (!root) return
    root.style.removeProperty(widthProperty)
    root.style.removeProperty(offsetProperty)
    root.removeAttribute(stateAttribute)
  }

  return {
    dispose: () => {
      cancelFrame()
      clearRoot()
      root = null
    },
    intentChanged: (nextRoot, intent) => {
      const nextTarget = intent.isCollapsed ? 0 : 1
      const nextExpandedWidth = resolveExpandedWidth(intent.expandedWidth)

      if (nextRoot !== root) {
        cancelFrame()
        clearRoot()
        root = nextRoot
        expandedWidth = nextExpandedWidth
        target = nextTarget
        axis = { value: target, velocity: 0 }
        present(target === 0 ? 'collapsed' : 'expanded')
        return
      }

      expandedWidth = nextExpandedWidth
      if (!root) return

      if (intent.reducedMotion) {
        cancelFrame()
        target = nextTarget
        axis = { value: target, velocity: 0 }
        present(target === 0 ? 'collapsed' : 'expanded')
        return
      }

      if (nextTarget === target) {
        if (animationFrameId === null) present(target === 0 ? 'collapsed' : 'expanded')
        return
      }

      axis = retargetSpringAxis(axis, nextTarget, 'preserve')
      target = nextTarget
      present(target === 0 ? 'closing' : 'opening')
      scheduleFrame()
    }
  }
}

function resolveExpandedWidth(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 280
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
