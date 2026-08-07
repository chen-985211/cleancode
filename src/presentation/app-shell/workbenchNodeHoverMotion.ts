export interface WorkbenchNodeHoverMotionSurface {
  readonly classList: Pick<DOMTokenList, 'add' | 'remove'>
  readonly style: Pick<CSSStyleDeclaration, 'removeProperty' | 'setProperty'>
}

export interface WorkbenchNodeHoverMotionFrameScheduler {
  readonly cancelFrame: (frameId: number) => void
  readonly now: () => number
  readonly requestFrame: (callback: FrameRequestCallback) => number
}

interface WorkbenchNodeHoverMotionControllerOptions {
  readonly scheduler?: WorkbenchNodeHoverMotionFrameScheduler
}

interface SurfaceMotionState {
  scale: number
  target: number
  velocity: number
}

export interface WorkbenchNodeHoverMotionController {
  readonly dispose: () => void
  readonly hoveredSurfaceChanged: (surface: WorkbenchNodeHoverMotionSurface | null) => void
  readonly suspend: () => void
}

const hoverMotionClassName = 'workbench-object-hover-motion--active'
const restingScale = 1
export const workbenchNodeHoverScale = 1.012
const hoverMotionResponse = 0.36
const hoverMotionDampingRatio = 0.72
const maximumFrameDeltaSeconds = 1 / 30
const settlementThresholds = { speed: 0.0005, value: 0.00002 }

const browserFrameScheduler: WorkbenchNodeHoverMotionFrameScheduler = {
  cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
  now: () => window.performance.now(),
  requestFrame: (callback) => window.requestAnimationFrame(callback)
}

export function createWorkbenchNodeHoverMotionController({
  scheduler = browserFrameScheduler
}: WorkbenchNodeHoverMotionControllerOptions = {}): WorkbenchNodeHoverMotionController {
  const surfaceStates = new Map<WorkbenchNodeHoverMotionSurface, SurfaceMotionState>()
  let animationFrameId: number | null = null
  let hoveredSurface: WorkbenchNodeHoverMotionSurface | null = null
  let lastFrameTimestamp = scheduler.now()

  const clearSurface = (surface: WorkbenchNodeHoverMotionSurface): void => {
    surface.style.removeProperty('--workbench-object-hover-scale')
    surface.classList.remove(hoverMotionClassName)
  }

  const presentSurface = (
    surface: WorkbenchNodeHoverMotionSurface,
    state: SurfaceMotionState
  ): void => {
    surface.classList.add(hoverMotionClassName)
    surface.style.setProperty('--workbench-object-hover-scale', `${roundMotionValue(state.scale)}`)
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
    hoveredSurface = null
  }

  return {
    dispose: suspend,
    hoveredSurfaceChanged: (nextSurface) => {
      if (nextSurface === hoveredSurface) return

      if (hoveredSurface) {
        const previousState = surfaceStates.get(hoveredSurface)
        if (previousState) previousState.target = restingScale
      }

      hoveredSurface = nextSurface
      if (nextSurface) {
        const nextState = surfaceStates.get(nextSurface) ?? {
          scale: restingScale,
          target: workbenchNodeHoverScale,
          velocity: 0
        }
        nextState.target = workbenchNodeHoverScale
        surfaceStates.set(nextSurface, nextState)
      }

      if (surfaceStates.size > 0) scheduleFrame()
    },
    suspend
  }
}

function advanceDampedScaleSpring(
  state: SurfaceMotionState,
  deltaSeconds: number
): SurfaceMotionState {
  if (deltaSeconds <= 0) return state

  const angularFrequency = (2 * Math.PI) / hoverMotionResponse
  const dampedFrequency =
    angularFrequency * Math.sqrt(1 - hoverMotionDampingRatio * hoverMotionDampingRatio)
  const displacement = state.scale - state.target
  const velocityCoefficient =
    (state.velocity + hoverMotionDampingRatio * angularFrequency * displacement) / dampedFrequency
  const decay = Math.exp(-hoverMotionDampingRatio * angularFrequency * deltaSeconds)
  const cosine = Math.cos(dampedFrequency * deltaSeconds)
  const sine = Math.sin(dampedFrequency * deltaSeconds)
  const nextDisplacement = decay * (displacement * cosine + velocityCoefficient * sine)
  const nextVelocity =
    decay *
    (-hoverMotionDampingRatio *
      angularFrequency *
      (displacement * cosine + velocityCoefficient * sine) +
      dampedFrequency * (-displacement * sine + velocityCoefficient * cosine))

  return {
    scale: state.target + nextDisplacement,
    target: state.target,
    velocity: nextVelocity
  }
}

function isScaleSpringSettled(state: SurfaceMotionState): boolean {
  return (
    Math.abs(state.scale - state.target) <= settlementThresholds.value &&
    Math.abs(state.velocity) <= settlementThresholds.speed
  )
}

function roundMotionValue(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}
