import type { TerminalGroupDropFeedback } from '../view-models/TerminalGroupPresentationTypes'
import {
  advanceSpringAxis,
  isSpringAxisSettled,
  retargetSpringAxis,
  type SpringAxis
} from '../../../../presentation/shared/motion/motionSpring'

export interface TerminalGroupDropSpringSurface {
  readonly classList: Pick<DOMTokenList, 'add' | 'remove'>
  readonly style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
}

export interface TerminalGroupDropSpringFrameScheduler {
  readonly cancelFrame: (frameId: number) => void
  readonly now: () => number
  readonly requestFrame: (callback: FrameRequestCallback) => number
}

interface TerminalGroupDropSpringControllerOptions {
  readonly scheduler?: TerminalGroupDropSpringFrameScheduler
}

interface SurfaceSpringState {
  scale: number
  target: number
  velocity: number
}

export interface TerminalGroupDropSpringController {
  readonly dispose: () => void
  readonly feedbackChanged: (
    surface: TerminalGroupDropSpringSurface | null,
    feedback: TerminalGroupDropFeedback | null
  ) => void
  readonly suspend: () => void
}

const activeClassName = 'terminal-group-drop-spring--active'
const restingScale = 1
export const terminalGroupDropEngagedScale = 1.012
export const terminalGroupDropRemovalScale = 0.988
const springResponse = 0.36
const springDampingRatio = 0.72
const settlementThresholds = { speed: 0.0005, value: 0.00002 }

const browserFrameScheduler: TerminalGroupDropSpringFrameScheduler = {
  cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
  now: () => window.performance.now(),
  requestFrame: (callback) => window.requestAnimationFrame(callback)
}

export function createTerminalGroupDropSpringController({
  scheduler = browserFrameScheduler
}: TerminalGroupDropSpringControllerOptions = {}): TerminalGroupDropSpringController {
  const surfaceStates = new Map<TerminalGroupDropSpringSurface, SurfaceSpringState>()
  let animationFrameId: number | null = null
  let feedbackSurface: TerminalGroupDropSpringSurface | null = null
  let activeFeedback: TerminalGroupDropFeedback | null = null
  let lastFrameTimestamp = scheduler.now()

  const clearSurface = (surface: TerminalGroupDropSpringSurface): void => {
    surface.style.removeProperty('--terminal-group-drop-scale')
    surface.classList.remove(activeClassName)
  }

  const presentSurface = (
    surface: TerminalGroupDropSpringSurface,
    state: SurfaceSpringState
  ): void => {
    surface.classList.add(activeClassName)
    surface.style.setProperty('--terminal-group-drop-scale', `${roundScale(state.scale)}`)
  }

  const scheduleFrame = (): void => {
    if (animationFrameId !== null) return
    lastFrameTimestamp = scheduler.now()
    animationFrameId = scheduler.requestFrame(advanceFrame)
  }

  const advanceFrame = (timestamp: number): void => {
    animationFrameId = null
    const deltaSeconds = Math.max(0, (timestamp - lastFrameTimestamp) / 1000)
    lastFrameTimestamp = timestamp
    let hasUnsettledSurface = false

    surfaceStates.forEach((state, surface) => {
      const nextState = advanceDampedScaleSpring(state, deltaSeconds)

      if (isScaleSpringSettled(nextState)) {
        nextState.scale = nextState.target
        nextState.velocity = 0

        if (nextState.target === restingScale) {
          surfaceStates.delete(surface)
          clearSurface(surface)
          return
        }

        surfaceStates.set(surface, nextState)
        presentSurface(surface, nextState)
        return
      }

      surfaceStates.set(surface, nextState)
      presentSurface(surface, nextState)
      hasUnsettledSurface = true
    })

    if (hasUnsettledSurface) scheduleFrame()
  }

  const suspend = (): void => {
    if (animationFrameId !== null) scheduler.cancelFrame(animationFrameId)
    animationFrameId = null
    surfaceStates.forEach((_state, surface) => clearSurface(surface))
    surfaceStates.clear()
    feedbackSurface = null
    activeFeedback = null
  }

  return {
    dispose: suspend,
    feedbackChanged: (surface, nextFeedback) => {
      const nextSurface = nextFeedback ? surface : null
      if (nextSurface === feedbackSurface && nextFeedback === activeFeedback) return

      if (feedbackSurface && feedbackSurface !== nextSurface) {
        const previousState = surfaceStates.get(feedbackSurface)
        if (previousState) retargetSurfaceSpring(previousState, restingScale)
      }

      feedbackSurface = nextSurface
      activeFeedback = nextFeedback
      if (nextSurface && nextFeedback) {
        const target = resolveFeedbackScale(nextFeedback)
        const nextState = surfaceStates.get(nextSurface) ?? {
          scale: restingScale,
          target,
          velocity: 0
        }
        retargetSurfaceSpring(nextState, target)
        surfaceStates.set(nextSurface, nextState)
        presentSurface(nextSurface, nextState)
      }

      if (surfaceStates.size > 0) scheduleFrame()
    },
    suspend
  }
}

function resolveFeedbackScale(feedback: TerminalGroupDropFeedback): number {
  return feedback === 'join' ? terminalGroupDropEngagedScale : terminalGroupDropRemovalScale
}

function advanceDampedScaleSpring(
  state: SurfaceSpringState,
  deltaSeconds: number
): SurfaceSpringState {
  const nextAxis = advanceSpringAxis(
    toSpringAxis(state),
    state.target,
    { dampingRatio: springDampingRatio, response: springResponse },
    deltaSeconds
  )

  return {
    scale: nextAxis.value,
    target: state.target,
    velocity: nextAxis.velocity
  }
}

function isScaleSpringSettled(state: SurfaceSpringState): boolean {
  return isSpringAxisSettled(toSpringAxis(state), state.target, settlementThresholds)
}

function retargetSurfaceSpring(state: SurfaceSpringState, target: number): void {
  const axis = retargetSpringAxis(toSpringAxis(state), target, 'preserve')
  state.scale = axis.value
  state.target = target
  state.velocity = axis.velocity
}

function toSpringAxis(state: SurfaceSpringState): SpringAxis {
  return { value: state.scale, velocity: state.velocity }
}

function roundScale(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}
