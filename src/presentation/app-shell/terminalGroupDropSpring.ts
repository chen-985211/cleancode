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
  readonly engagedSurfaceChanged: (surface: TerminalGroupDropSpringSurface | null) => void
  readonly suspend: () => void
}

const activeClassName = 'terminal-group-drop-spring--active'
const restingScale = 1
export const terminalGroupDropEngagedScale = 1.012
const springResponse = 0.36
const springDampingRatio = 0.72
const maximumFrameDeltaSeconds = 1 / 30
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
  let engagedSurface: TerminalGroupDropSpringSurface | null = null
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
    const deltaSeconds = clamp((timestamp - lastFrameTimestamp) / 1000, 0, maximumFrameDeltaSeconds)
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
    engagedSurface = null
  }

  return {
    dispose: suspend,
    engagedSurfaceChanged: (nextSurface) => {
      if (nextSurface === engagedSurface) return

      if (engagedSurface) {
        const previousState = surfaceStates.get(engagedSurface)
        if (previousState) previousState.target = restingScale
      }

      engagedSurface = nextSurface
      if (nextSurface) {
        const nextState = surfaceStates.get(nextSurface) ?? {
          scale: restingScale,
          target: terminalGroupDropEngagedScale,
          velocity: 0
        }
        nextState.target = terminalGroupDropEngagedScale
        surfaceStates.set(nextSurface, nextState)
        presentSurface(nextSurface, nextState)
      }

      if (surfaceStates.size > 0) scheduleFrame()
    },
    suspend
  }
}

function advanceDampedScaleSpring(
  state: SurfaceSpringState,
  deltaSeconds: number
): SurfaceSpringState {
  if (deltaSeconds <= 0) return state

  const angularFrequency = (2 * Math.PI) / springResponse
  const dampedFrequency = angularFrequency * Math.sqrt(1 - springDampingRatio * springDampingRatio)
  const displacement = state.scale - state.target
  const velocityCoefficient =
    (state.velocity + springDampingRatio * angularFrequency * displacement) / dampedFrequency
  const decay = Math.exp(-springDampingRatio * angularFrequency * deltaSeconds)
  const cosine = Math.cos(dampedFrequency * deltaSeconds)
  const sine = Math.sin(dampedFrequency * deltaSeconds)
  const nextDisplacement = decay * (displacement * cosine + velocityCoefficient * sine)
  const nextVelocity =
    decay *
    (-springDampingRatio * angularFrequency * (displacement * cosine + velocityCoefficient * sine) +
      dampedFrequency * (-displacement * sine + velocityCoefficient * cosine))

  return {
    scale: state.target + nextDisplacement,
    target: state.target,
    velocity: nextVelocity
  }
}

function isScaleSpringSettled(state: SurfaceSpringState): boolean {
  return (
    Math.abs(state.scale - state.target) <= settlementThresholds.value &&
    Math.abs(state.velocity) <= settlementThresholds.speed
  )
}

function roundScale(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}
