import {
  advanceSpringAxis,
  isSpringAxisSettled,
  retargetSpringAxis,
  type SpringAxis
} from './motionSpring'
import type { WorkbenchObjectMotion } from './types'

export interface WorkbenchObjectSpringSurface {
  readonly style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
}

export interface WorkbenchObjectSpringFrameScheduler {
  readonly cancelFrame: (frameId: number) => void
  readonly now: () => number
  readonly requestFrame: (callback: FrameRequestCallback) => number
}

interface WorkbenchObjectSpringControllerOptions {
  readonly scheduler?: WorkbenchObjectSpringFrameScheduler
}

export interface WorkbenchObjectSpringController {
  readonly dispose: () => void
  readonly motionChanged: (
    surface: WorkbenchObjectSpringSurface | null,
    motion: WorkbenchObjectMotion | null,
    reducedMotion: boolean,
    onComplete: (motionId: string) => void
  ) => void
}

const xProperty = '--workbench-object-motion-x'
const yProperty = '--workbench-object-motion-y'
const opacityProperty = '--workbench-object-motion-opacity'
const contentOpacityProperty = '--workbench-object-motion-content-opacity'
const shellInsetProperty = '--workbench-object-motion-shell-inset'
const spatialSpringDynamics = { dampingRatio: 1, response: 0.36 }
const disclosureSpringDynamics = { dampingRatio: 1, response: 0.32 }
const disclosureOpacityDynamics = { dampingRatio: 1, response: 0.18 }
const shellRevealInsetPercent = 8
const positionSettlementThresholds = { speed: 1, value: 0.1 }
const opacitySettlementThresholds = { speed: 0.02, value: 0.002 }

const browserFrameScheduler: WorkbenchObjectSpringFrameScheduler = {
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

export function createWorkbenchObjectSpringController({
  scheduler = browserFrameScheduler
}: WorkbenchObjectSpringControllerOptions = {}): WorkbenchObjectSpringController {
  let surface: WorkbenchObjectSpringSurface | null = null
  let motion: WorkbenchObjectMotion | null = null
  let onComplete: (motionId: string) => void = () => undefined
  let xAxis: SpringAxis = { value: 0, velocity: 0 }
  let yAxis: SpringAxis = { value: 0, velocity: 0 }
  let opacityAxis: SpringAxis = { value: 1, velocity: 0 }
  let contentOpacityAxis: SpringAxis = { value: 1, velocity: 0 }
  let xTarget = 0
  let yTarget = 0
  let opacityTarget = 1
  let contentOpacityTarget = 1
  let animationFrameId: number | null = null
  let lastFrameTimestamp = scheduler.now()

  const cancelFrame = (): void => {
    if (animationFrameId !== null) scheduler.cancelFrame(animationFrameId)
    animationFrameId = null
  }

  const clearSurface = (): void => {
    if (!surface) return
    surface.style.removeProperty(xProperty)
    surface.style.removeProperty(yProperty)
    surface.style.removeProperty(opacityProperty)
    surface.style.removeProperty(contentOpacityProperty)
    surface.style.removeProperty(shellInsetProperty)
  }

  const present = (): void => {
    if (!surface) return
    surface.style.setProperty(xProperty, `${round(xAxis.value)}px`)
    surface.style.setProperty(yProperty, `${round(yAxis.value)}px`)
    surface.style.setProperty(opacityProperty, `${round(opacityAxis.value)}`)
    surface.style.setProperty(contentOpacityProperty, `${round(contentOpacityAxis.value)}`)
    surface.style.setProperty(
      shellInsetProperty,
      `${round((1 - contentOpacityAxis.value) * shellRevealInsetPercent)}%`
    )
  }

  const complete = (): void => {
    const completedMotion = motion
    if (!completedMotion) return
    motion = null
    onComplete(completedMotion.id)
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
    const positionDynamics = isDisclosureMotion(motion)
      ? disclosureSpringDynamics
      : spatialSpringDynamics
    xAxis = advanceSpringAxis(xAxis, xTarget, positionDynamics, elapsedSeconds)
    yAxis = advanceSpringAxis(yAxis, yTarget, positionDynamics, elapsedSeconds)
    opacityAxis = advanceSpringAxis(
      opacityAxis,
      opacityTarget,
      isDisclosureMotion(motion) ? disclosureOpacityDynamics : spatialSpringDynamics,
      elapsedSeconds
    )
    contentOpacityAxis = advanceSpringAxis(
      contentOpacityAxis,
      contentOpacityTarget,
      motion?.contentOpacity ? disclosureSpringDynamics : disclosureOpacityDynamics,
      elapsedSeconds
    )

    if (
      isSpringAxisSettled(xAxis, xTarget, positionSettlementThresholds) &&
      isSpringAxisSettled(yAxis, yTarget, positionSettlementThresholds) &&
      isSpringAxisSettled(opacityAxis, opacityTarget, opacitySettlementThresholds) &&
      isSpringAxisSettled(contentOpacityAxis, contentOpacityTarget, opacitySettlementThresholds)
    ) {
      xAxis = { value: xTarget, velocity: 0 }
      yAxis = { value: yTarget, velocity: 0 }
      opacityAxis = { value: opacityTarget, velocity: 0 }
      contentOpacityAxis = { value: contentOpacityTarget, velocity: 0 }
      present()
      complete()
      return
    }

    present()
    scheduleFrame()
  }

  const initializeMotion = (nextMotion: WorkbenchObjectMotion): void => {
    const collapsesToOffset = nextMotion.kind === 'group-collapse'
    xAxis = { value: collapsesToOffset ? 0 : nextMotion.offset.x, velocity: 0 }
    yAxis = { value: collapsesToOffset ? 0 : nextMotion.offset.y, velocity: 0 }
    opacityAxis = {
      value: nextMotion.opacity?.from ?? (nextMotion.kind === 'group-expand' ? 0.28 : 1),
      velocity: 0
    }
    contentOpacityAxis = { value: nextMotion.contentOpacity?.from ?? 1, velocity: 0 }
    xTarget = collapsesToOffset ? nextMotion.offset.x : 0
    yTarget = collapsesToOffset ? nextMotion.offset.y : 0
    opacityTarget = nextMotion.opacity?.to ?? (collapsesToOffset ? 0 : 1)
    contentOpacityTarget = nextMotion.contentOpacity?.to ?? 1
  }

  const retargetMotion = (nextMotion: WorkbenchObjectMotion): void => {
    if (
      nextMotion.kind === 'group-join' ||
      nextMotion.kind === 'group-leave' ||
      nextMotion.kind === 'group-reflow'
    ) {
      xAxis = { ...xAxis, value: xAxis.value + nextMotion.offset.x }
      yAxis = { ...yAxis, value: yAxis.value + nextMotion.offset.y }
    }

    const collapsesToOffset = nextMotion.kind === 'group-collapse'
    const reversesShellReveal = Boolean(
      motion?.contentOpacity && nextMotion.contentOpacity && isDisclosureMotion(motion)
    )
    xTarget = collapsesToOffset ? nextMotion.offset.x : 0
    yTarget = collapsesToOffset ? nextMotion.offset.y : 0
    opacityTarget = nextMotion.opacity?.to ?? (collapsesToOffset ? 0 : 1)
    contentOpacityTarget = nextMotion.contentOpacity?.to ?? 1
    xAxis = retargetSpringAxis(xAxis, xTarget, 'preserve')
    yAxis = retargetSpringAxis(yAxis, yTarget, 'preserve')
    opacityAxis = retargetSpringAxis(opacityAxis, opacityTarget, 'preserve')
    contentOpacityAxis = reversesShellReveal
      ? { value: 1 - contentOpacityAxis.value, velocity: -contentOpacityAxis.velocity }
      : nextMotion.contentOpacity
        ? { value: nextMotion.contentOpacity.from, velocity: 0 }
        : retargetSpringAxis(contentOpacityAxis, contentOpacityTarget, 'preserve')
  }

  return {
    dispose: () => {
      cancelFrame()
      clearSurface()
      surface = null
      motion = null
    },
    motionChanged: (nextSurface, nextMotion, reducedMotion, nextOnComplete) => {
      if (nextSurface !== surface) {
        cancelFrame()
        clearSurface()
        surface = nextSurface
        motion = null
      }

      onComplete = nextOnComplete
      if (!surface) return

      if (!nextMotion || nextMotion.kind === 'create') {
        cancelFrame()
        motion = null
        clearSurface()
        return
      }

      if (motion?.id !== nextMotion.id) {
        if (motion) retargetMotion(nextMotion)
        else initializeMotion(nextMotion)
        motion = nextMotion
      }

      if (reducedMotion) {
        cancelFrame()
        xAxis = { value: xTarget, velocity: 0 }
        yAxis = { value: yTarget, velocity: 0 }
        opacityAxis = { value: opacityTarget, velocity: 0 }
        contentOpacityAxis = { value: contentOpacityTarget, velocity: 0 }
        present()
        complete()
        return
      }

      present()
      scheduleFrame()
    }
  }
}

function isDisclosureMotion(motion: WorkbenchObjectMotion | null): boolean {
  return motion?.kind === 'group-collapse' || motion?.kind === 'group-expand'
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
