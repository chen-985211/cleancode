import {
  advanceSpringAxis,
  isSpringAxisSettled,
  retargetSpringAxis,
  type SpringAxis
} from '../../../shared/motion/motionSpring'

export interface ProjectSidebarMotionSurface {
  readonly style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
  readonly removeAttribute: (name: string) => unknown
  readonly setAttribute: (name: string, value: string) => unknown
}

export interface ProjectSidebarMotionElements {
  readonly sidebar: ProjectSidebarMotionSurface | null
  readonly titlebar: ProjectSidebarMotionSurface | null
  readonly spatial: ProjectSidebarMotionSurface | null
  readonly center: ProjectSidebarMotionSurface | null
  readonly statusbar?: ProjectSidebarMotionSurface | null
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
  readonly onMotionActiveChange?: (isActive: boolean) => void
  readonly scheduler?: ProjectSidebarMotionFrameScheduler
}

export interface ProjectSidebarMotionController {
  readonly dispose: () => void
  readonly intentChanged: (
    elements: ProjectSidebarMotionElements,
    intent: ProjectSidebarMotionIntent
  ) => void
}

const transformProperty = 'transform'
const stateAttribute = 'data-project-sidebar-motion-state'
const springDynamics = { dampingRatio: 1, response: 0.42 }
const settlementThresholds = { speed: 0.001, value: 0.0001 }
export const projectSidebarExpandedWidth = 280

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
  onMotionActiveChange = () => undefined,
  scheduler = browserFrameScheduler
}: ProjectSidebarMotionControllerOptions = {}): ProjectSidebarMotionController {
  let elements: ProjectSidebarMotionElements | null = null
  let axis: SpringAxis = { value: 1, velocity: 0 }
  let target = 1
  let expandedWidth = 280
  let animationFrameId: number | null = null
  let lastFrameTimestamp = scheduler.now()
  let presentationState: 'collapsed' | 'closing' | 'expanded' | 'opening' | null = null
  let isMotionActive = false

  const setMotionActive = (nextIsActive: boolean): void => {
    if (nextIsActive === isMotionActive) return
    isMotionActive = nextIsActive
    onMotionActiveChange(nextIsActive)
  }

  const cancelFrame = (): void => {
    if (animationFrameId !== null) scheduler.cancelFrame(animationFrameId)
    animationFrameId = null
  }

  const present = (state: 'collapsed' | 'closing' | 'expanded' | 'opening'): void => {
    if (!elements) return
    const layoutProgress = clamp(axis.value, 0, 1)
    const spatialOffset = expandedWidth * layoutProgress
    if (state === 'collapsed' || state === 'expanded') {
      clearTranslations(elements)
    } else {
      setTranslation(elements.sidebar, expandedWidth * (layoutProgress - 1))
      setTranslation(elements.titlebar, expandedWidth * (layoutProgress - 1))
      setTranslation(elements.spatial, spatialOffset)
      setTranslation(elements.center, spatialOffset / 2)
      setTranslation(elements.statusbar ?? null, spatialOffset)
    }
    if (presentationState !== state) {
      setPresentationState(elements, state)
      presentationState = state
    }
    setMotionActive(state === 'opening' || state === 'closing')
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

  const clearElements = (): void => {
    if (!elements) return
    clearTranslations(elements)
    elements.sidebar?.removeAttribute(stateAttribute)
    elements.titlebar?.removeAttribute(stateAttribute)
    elements.spatial?.removeAttribute(stateAttribute)
    elements.center?.removeAttribute(stateAttribute)
    elements.statusbar?.removeAttribute(stateAttribute)
    presentationState = null
  }

  return {
    dispose: () => {
      cancelFrame()
      setMotionActive(false)
      clearElements()
      elements = null
    },
    intentChanged: (nextElements, intent) => {
      const nextTarget = intent.isCollapsed ? 0 : 1
      const nextExpandedWidth = resolveExpandedWidth(intent.expandedWidth)

      if (!hasSameElements(elements, nextElements)) {
        cancelFrame()
        clearElements()
        elements = nextElements
        expandedWidth = nextExpandedWidth
        target = nextTarget
        axis = { value: target, velocity: 0 }
        present(target === 0 ? 'collapsed' : 'expanded')
        return
      }

      expandedWidth = nextExpandedWidth

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

function hasSameElements(
  current: ProjectSidebarMotionElements | null,
  next: ProjectSidebarMotionElements
): boolean {
  return (
    current?.sidebar === next.sidebar &&
    current.titlebar === next.titlebar &&
    current.spatial === next.spatial &&
    current.center === next.center &&
    current.statusbar === next.statusbar
  )
}

function setTranslation(element: ProjectSidebarMotionSurface | null, offset: number): void {
  element?.style.setProperty(transformProperty, `translate3d(${round(offset)}px, 0, 0)`)
}

function clearTranslations(elements: ProjectSidebarMotionElements): void {
  elements.sidebar?.style.removeProperty(transformProperty)
  elements.titlebar?.style.removeProperty(transformProperty)
  elements.spatial?.style.removeProperty(transformProperty)
  elements.center?.style.removeProperty(transformProperty)
  elements.statusbar?.style.removeProperty(transformProperty)
}

function setPresentationState(
  elements: ProjectSidebarMotionElements,
  state: 'collapsed' | 'closing' | 'expanded' | 'opening'
): void {
  elements.sidebar?.setAttribute(stateAttribute, state)
  elements.titlebar?.setAttribute(stateAttribute, state)
  elements.spatial?.setAttribute(stateAttribute, state)
  elements.center?.setAttribute(stateAttribute, state)
  elements.statusbar?.setAttribute(stateAttribute, state)
}

function resolveExpandedWidth(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : projectSidebarExpandedWidth
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
