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
const shellXProperty = '--workbench-object-motion-shell-x'
const shellYProperty = '--workbench-object-motion-shell-y'
const shellWidthProperty = '--workbench-object-motion-shell-width'
const shellHeightProperty = '--workbench-object-motion-shell-height'
const scaleProperty = '--workbench-object-motion-scale'
const spatialSpringDynamics = { dampingRatio: 1, response: 0.36 }
const canvasGridMinimumResponse = 0.36
const canvasGridMaximumResponse = 0.52
const canvasGridDistanceResponseDivisor = 160
const canvasDropHorizontalDynamics = { dampingRatio: 1, response: 0.34 }
const canvasDropLandingDynamics = { dampingRatio: 1, response: 0.24 }
const canvasDropGravity = 1_800
const canvasDropReboundRatio = 0.28
const canvasDropMaximumReboundSpeed = 96
const groupExpandSpringDynamics = { dampingRatio: 1, response: 0.36 }
const groupCollapseSpringDynamics = { dampingRatio: 1, response: 0.3 }
const disclosureOpacityDynamics = { dampingRatio: 1, response: 0.18 }
const disclosureRevealDynamics = { dampingRatio: 1, response: 0.12 }
const presenceCreateSpringDynamics = { dampingRatio: 1, response: 0.34 }
const presenceDeleteSpringDynamics = { dampingRatio: 1, response: 0.26 }
const positionSettlementThresholds = { speed: 1, value: 0.1 }
const opacitySettlementThresholds = { speed: 0.02, value: 0.002 }
const scaleSettlementThresholds = { speed: 0.02, value: 0.002 }

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
  let scaleAxis: SpringAxis = { value: 1, velocity: 0 }
  let shellXAxis: SpringAxis = { value: 0, velocity: 0 }
  let shellYAxis: SpringAxis = { value: 0, velocity: 0 }
  let shellWidthAxis: SpringAxis = { value: 0, velocity: 0 }
  let shellHeightAxis: SpringAxis = { value: 0, velocity: 0 }
  let xTarget = 0
  let yTarget = 0
  let opacityTarget = 1
  let contentOpacityTarget = 1
  let scaleTarget = 1
  let shellXTarget = 0
  let shellYTarget = 0
  let shellWidthTarget = 0
  let shellHeightTarget = 0
  let delayRemainingSeconds = 0
  let opacityDelayRemainingSeconds = 0
  let contentDelayRemainingSeconds = 0
  let isDropFalling = false
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
    surface.style.removeProperty(shellXProperty)
    surface.style.removeProperty(shellYProperty)
    surface.style.removeProperty(shellWidthProperty)
    surface.style.removeProperty(shellHeightProperty)
    surface.style.removeProperty(scaleProperty)
  }

  const present = (): void => {
    if (!surface) return
    surface.style.setProperty(xProperty, `${round(xAxis.value)}px`)
    surface.style.setProperty(yProperty, `${round(yAxis.value)}px`)
    surface.style.setProperty(opacityProperty, `${round(opacityAxis.value)}`)
    surface.style.setProperty(contentOpacityProperty, `${round(contentOpacityAxis.value)}`)
    surface.style.setProperty(scaleProperty, `${round(scaleAxis.value)}`)
    if (motion?.shellRect) {
      surface.style.setProperty(
        shellXProperty,
        `${round(shellXAxis.value - motion.shellRect.to.x)}px`
      )
      surface.style.setProperty(
        shellYProperty,
        `${round(shellYAxis.value - motion.shellRect.to.y)}px`
      )
      surface.style.setProperty(shellWidthProperty, `${round(shellWidthAxis.value)}px`)
      surface.style.setProperty(shellHeightProperty, `${round(shellHeightAxis.value)}px`)
    } else {
      surface.style.removeProperty(shellXProperty)
      surface.style.removeProperty(shellYProperty)
      surface.style.removeProperty(shellWidthProperty)
      surface.style.removeProperty(shellHeightProperty)
    }
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
    const activeElapsedSeconds = Math.max(0, elapsedSeconds - delayRemainingSeconds)
    delayRemainingSeconds = Math.max(0, delayRemainingSeconds - elapsedSeconds)
    if (activeElapsedSeconds === 0) {
      present()
      scheduleFrame()
      return
    }
    const opacityActiveElapsedSeconds = Math.max(
      0,
      activeElapsedSeconds - opacityDelayRemainingSeconds
    )
    opacityDelayRemainingSeconds = Math.max(0, opacityDelayRemainingSeconds - activeElapsedSeconds)
    const contentActiveElapsedSeconds = Math.max(
      0,
      activeElapsedSeconds - contentDelayRemainingSeconds
    )
    contentDelayRemainingSeconds = Math.max(0, contentDelayRemainingSeconds - activeElapsedSeconds)

    const positionDynamics = resolvePositionDynamics(motion)
    const xPositionDynamics = resolveAxisPositionDynamics(motion, 'x', positionDynamics)
    const yPositionDynamics = resolveAxisPositionDynamics(motion, 'y', positionDynamics)
    xAxis = advanceSpringAxis(
      xAxis,
      xTarget,
      motion?.positionDynamics === 'drop' ? canvasDropHorizontalDynamics : xPositionDynamics,
      activeElapsedSeconds
    )
    yAxis =
      motion?.positionDynamics === 'drop'
        ? advanceDropYAxis(activeElapsedSeconds)
        : advanceSpringAxis(yAxis, yTarget, yPositionDynamics, activeElapsedSeconds)
    opacityAxis = advanceSpringAxis(
      opacityAxis,
      opacityTarget,
      motion?.kind === 'group-expand'
        ? motion.opacityDelayMs
          ? disclosureRevealDynamics
          : positionDynamics
        : isDisclosureMotion(motion)
          ? disclosureOpacityDynamics
          : spatialSpringDynamics,
      opacityActiveElapsedSeconds
    )
    contentOpacityAxis = advanceSpringAxis(
      contentOpacityAxis,
      contentOpacityTarget,
      motion?.contentDelayMs
        ? disclosureRevealDynamics
        : motion?.contentOpacity
          ? positionDynamics
          : disclosureOpacityDynamics,
      contentActiveElapsedSeconds
    )
    scaleAxis = advanceSpringAxis(
      scaleAxis,
      scaleTarget,
      isDisclosureMotion(motion)
        ? positionDynamics
        : motion?.kind === 'delete'
          ? presenceDeleteSpringDynamics
          : presenceCreateSpringDynamics,
      activeElapsedSeconds
    )
    if (motion?.shellRect) {
      shellXAxis = advanceSpringAxis(
        shellXAxis,
        shellXTarget,
        positionDynamics,
        activeElapsedSeconds
      )
      shellYAxis = advanceSpringAxis(
        shellYAxis,
        shellYTarget,
        positionDynamics,
        activeElapsedSeconds
      )
      shellWidthAxis = advanceSpringAxis(
        shellWidthAxis,
        shellWidthTarget,
        positionDynamics,
        activeElapsedSeconds
      )
      shellHeightAxis = advanceSpringAxis(
        shellHeightAxis,
        shellHeightTarget,
        positionDynamics,
        activeElapsedSeconds
      )
    }

    if (
      isSpringAxisSettled(xAxis, xTarget, positionSettlementThresholds) &&
      !isDropFalling &&
      isSpringAxisSettled(yAxis, yTarget, positionSettlementThresholds) &&
      isSpringAxisSettled(opacityAxis, opacityTarget, opacitySettlementThresholds) &&
      isSpringAxisSettled(contentOpacityAxis, contentOpacityTarget, opacitySettlementThresholds) &&
      isSpringAxisSettled(scaleAxis, scaleTarget, scaleSettlementThresholds) &&
      isShellMotionSettled()
    ) {
      xAxis = { value: xTarget, velocity: 0 }
      yAxis = { value: yTarget, velocity: 0 }
      opacityAxis = { value: opacityTarget, velocity: 0 }
      contentOpacityAxis = { value: contentOpacityTarget, velocity: 0 }
      scaleAxis = { value: scaleTarget, velocity: 0 }
      shellXAxis = { value: shellXTarget, velocity: 0 }
      shellYAxis = { value: shellYTarget, velocity: 0 }
      shellWidthAxis = { value: shellWidthTarget, velocity: 0 }
      shellHeightAxis = { value: shellHeightTarget, velocity: 0 }
      present()
      complete()
      return
    }

    present()
    scheduleFrame()
  }

  const isShellMotionSettled = (): boolean =>
    !motion?.shellRect ||
    (isSpringAxisSettled(shellXAxis, shellXTarget, positionSettlementThresholds) &&
      isSpringAxisSettled(shellYAxis, shellYTarget, positionSettlementThresholds) &&
      isSpringAxisSettled(shellWidthAxis, shellWidthTarget, positionSettlementThresholds) &&
      isSpringAxisSettled(shellHeightAxis, shellHeightTarget, positionSettlementThresholds))

  const advanceDropYAxis = (elapsedSeconds: number): SpringAxis => {
    if (!isDropFalling) {
      return advanceSpringAxis(yAxis, yTarget, canvasDropLandingDynamics, elapsedSeconds)
    }

    const distanceToImpact = yTarget - yAxis.value
    if (distanceToImpact <= 0) {
      isDropFalling = false
      return advanceSpringAxis(yAxis, yTarget, canvasDropLandingDynamics, elapsedSeconds)
    }

    const impactTime =
      (Math.sqrt(yAxis.velocity * yAxis.velocity + 2 * canvasDropGravity * distanceToImpact) -
        yAxis.velocity) /
      canvasDropGravity
    if (impactTime > elapsedSeconds) {
      return {
        value:
          yAxis.value +
          yAxis.velocity * elapsedSeconds +
          0.5 * canvasDropGravity * elapsedSeconds * elapsedSeconds,
        velocity: yAxis.velocity + canvasDropGravity * elapsedSeconds
      }
    }

    const impactVelocity = yAxis.velocity + canvasDropGravity * impactTime
    const reboundVelocity = -Math.min(
      canvasDropMaximumReboundSpeed,
      impactVelocity * canvasDropReboundRatio
    )
    isDropFalling = false
    return advanceSpringAxis(
      { value: yTarget, velocity: reboundVelocity },
      yTarget,
      canvasDropLandingDynamics,
      elapsedSeconds - impactTime
    )
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
    scaleAxis = { value: nextMotion.scale?.from ?? 1, velocity: 0 }
    shellXAxis = { value: nextMotion.shellRect?.from.x ?? 0, velocity: 0 }
    shellYAxis = { value: nextMotion.shellRect?.from.y ?? 0, velocity: 0 }
    shellWidthAxis = { value: nextMotion.shellRect?.from.width ?? 0, velocity: 0 }
    shellHeightAxis = { value: nextMotion.shellRect?.from.height ?? 0, velocity: 0 }
    xTarget = collapsesToOffset ? nextMotion.offset.x : 0
    yTarget = collapsesToOffset ? nextMotion.offset.y : 0
    opacityTarget = nextMotion.opacity?.to ?? (collapsesToOffset ? 0 : 1)
    contentOpacityTarget = nextMotion.contentOpacity?.to ?? 1
    scaleTarget = nextMotion.scale?.to ?? 1
    shellXTarget = nextMotion.shellRect?.to.x ?? 0
    shellYTarget = nextMotion.shellRect?.to.y ?? 0
    shellWidthTarget = nextMotion.shellRect?.to.width ?? 0
    shellHeightTarget = nextMotion.shellRect?.to.height ?? 0
    isDropFalling = nextMotion.positionDynamics === 'drop' && yAxis.value < yTarget
    delayRemainingSeconds = (nextMotion.delayMs ?? 0) / 1000
    opacityDelayRemainingSeconds = (nextMotion.opacityDelayMs ?? 0) / 1000
    contentDelayRemainingSeconds = (nextMotion.contentDelayMs ?? 0) / 1000
  }

  const retargetMotion = (nextMotion: WorkbenchObjectMotion): void => {
    if (
      nextMotion.kind === 'group-join' ||
      nextMotion.kind === 'group-leave' ||
      nextMotion.kind === 'group-reflow' ||
      nextMotion.kind === 'canvas-arrange'
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
    scaleTarget = nextMotion.scale?.to ?? 1
    shellXTarget = nextMotion.shellRect?.to.x ?? 0
    shellYTarget = nextMotion.shellRect?.to.y ?? 0
    shellWidthTarget = nextMotion.shellRect?.to.width ?? 0
    shellHeightTarget = nextMotion.shellRect?.to.height ?? 0
    isDropFalling = nextMotion.positionDynamics === 'drop' && yAxis.value < yTarget
    delayRemainingSeconds = 0
    opacityDelayRemainingSeconds = 0
    contentDelayRemainingSeconds = 0
    const retargetPolicy = isDisclosureMotion(nextMotion) ? 'toward-target-only' : 'preserve'
    const hidesImmediately =
      nextMotion.kind === 'group-collapse' &&
      nextMotion.opacity?.from === 0 &&
      nextMotion.opacity.to === 0
    xAxis = retargetSpringAxis(xAxis, xTarget, retargetPolicy)
    yAxis = retargetSpringAxis(yAxis, yTarget, retargetPolicy)
    opacityAxis = hidesImmediately
      ? { value: 0, velocity: 0 }
      : retargetSpringAxis(opacityAxis, opacityTarget, 'preserve')
    contentOpacityAxis = reversesShellReveal
      ? { value: 1 - contentOpacityAxis.value, velocity: -contentOpacityAxis.velocity }
      : nextMotion.contentOpacity
        ? { value: nextMotion.contentOpacity.from, velocity: 0 }
        : retargetSpringAxis(contentOpacityAxis, contentOpacityTarget, 'preserve')
    scaleAxis = retargetSpringAxis(scaleAxis, scaleTarget, 'toward-target-only')
    if (nextMotion.shellRect) {
      if (motion?.shellRect) {
        shellXAxis = retargetSpringAxis(shellXAxis, shellXTarget, 'toward-target-only')
        shellYAxis = retargetSpringAxis(shellYAxis, shellYTarget, 'toward-target-only')
        shellWidthAxis = retargetSpringAxis(shellWidthAxis, shellWidthTarget, 'toward-target-only')
        shellHeightAxis = retargetSpringAxis(
          shellHeightAxis,
          shellHeightTarget,
          'toward-target-only'
        )
      } else {
        shellXAxis = { value: nextMotion.shellRect.from.x, velocity: 0 }
        shellYAxis = { value: nextMotion.shellRect.from.y, velocity: 0 }
        shellWidthAxis = { value: nextMotion.shellRect.from.width, velocity: 0 }
        shellHeightAxis = { value: nextMotion.shellRect.from.height, velocity: 0 }
      }
    }
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

      if (!nextMotion || (nextMotion.kind === 'create' && !nextMotion.scale)) {
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
        isDropFalling = false
        xAxis = { value: xTarget, velocity: 0 }
        yAxis = { value: yTarget, velocity: 0 }
        opacityAxis = { value: opacityTarget, velocity: 0 }
        contentOpacityAxis = { value: contentOpacityTarget, velocity: 0 }
        scaleAxis = { value: scaleTarget, velocity: 0 }
        shellXAxis = { value: shellXTarget, velocity: 0 }
        shellYAxis = { value: shellYTarget, velocity: 0 }
        shellWidthAxis = { value: shellWidthTarget, velocity: 0 }
        shellHeightAxis = { value: shellHeightTarget, velocity: 0 }
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

function resolvePositionDynamics(motion: WorkbenchObjectMotion | null): {
  readonly dampingRatio: number
  readonly response: number
} {
  if (motion?.kind === 'group-collapse') return groupCollapseSpringDynamics
  if (motion?.kind === 'group-expand') return groupExpandSpringDynamics
  return spatialSpringDynamics
}

function resolveAxisPositionDynamics(
  motion: WorkbenchObjectMotion | null,
  axis: 'x' | 'y',
  fallback: { readonly dampingRatio: number; readonly response: number }
): { readonly dampingRatio: number; readonly response: number } {
  if (motion?.positionDynamics !== 'grid') return fallback
  const distance = Math.abs(motion.offset[axis])
  return {
    dampingRatio: 1,
    response: Math.min(
      canvasGridMaximumResponse,
      canvasGridMinimumResponse + Math.sqrt(distance) / canvasGridDistanceResponseDivisor
    )
  }
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
