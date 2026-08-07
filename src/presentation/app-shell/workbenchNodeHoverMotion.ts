import {
  advanceCriticalSpringAxis,
  isCriticalSpringAxisSettled,
  type CriticalSpringAxis
} from './workbenchViewportSpring'

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

interface PointerPosition {
  readonly x: number
  readonly y: number
}

interface PendingPointerSample {
  readonly position: PointerPosition
  readonly surface: WorkbenchNodeHoverMotionSurface | null
}

interface SurfaceMotionState {
  x: CriticalSpringAxis
  y: CriticalSpringAxis
}

export interface WorkbenchNodeHoverMotionController {
  readonly dispose: () => void
  readonly pointerMoved: (
    surface: WorkbenchNodeHoverMotionSurface | null,
    position: PointerPosition
  ) => void
  readonly suspend: () => void
}

const hoverMotionClassName = 'workbench-object-hover-motion--active'
const hoverMotionResponse = 0.3
const hoverImpulseExponent = 1.4
const hoverImpulseMultiplier = 0.01
const maximumHoverTranslation = 2.4
const velocityHandoffMultiplier = 18
const maximumFrameDeltaSeconds = 1 / 30
const settlementThresholds = { speed: 0.08, value: 0.008 }

const browserFrameScheduler: WorkbenchNodeHoverMotionFrameScheduler = {
  cancelFrame: (frameId) => window.cancelAnimationFrame(frameId),
  now: () => window.performance.now(),
  requestFrame: (callback) => window.requestAnimationFrame(callback)
}

export function resolveWorkbenchHoverImpulse(pointerDelta: number): number {
  if (!Number.isFinite(pointerDelta) || pointerDelta === 0) return 0

  return clamp(
    Math.sign(pointerDelta) *
      Math.pow(Math.abs(pointerDelta), hoverImpulseExponent) *
      hoverImpulseMultiplier,
    -maximumHoverTranslation,
    maximumHoverTranslation
  )
}

export function createWorkbenchNodeHoverMotionController({
  scheduler = browserFrameScheduler
}: WorkbenchNodeHoverMotionControllerOptions = {}): WorkbenchNodeHoverMotionController {
  const surfaceStates = new Map<WorkbenchNodeHoverMotionSurface, SurfaceMotionState>()
  let animationFrameId: number | null = null
  let lastFrameTimestamp = scheduler.now()
  let lastPointerPosition: PointerPosition | null = null
  let pendingPointerSample: PendingPointerSample | null = null

  const clearSurface = (surface: WorkbenchNodeHoverMotionSurface): void => {
    surface.style.removeProperty('--workbench-object-hover-x')
    surface.style.removeProperty('--workbench-object-hover-y')
    surface.classList.remove(hoverMotionClassName)
  }

  const presentSurface = (
    surface: WorkbenchNodeHoverMotionSurface,
    state: SurfaceMotionState
  ): void => {
    surface.classList.add(hoverMotionClassName)
    surface.style.setProperty('--workbench-object-hover-x', `${roundMotionValue(state.x.value)}px`)
    surface.style.setProperty('--workbench-object-hover-y', `${roundMotionValue(state.y.value)}px`)
  }

  const scheduleFrame = (): void => {
    if (animationFrameId !== null || (surfaceStates.size === 0 && !pendingPointerSample)) return
    lastFrameTimestamp = scheduler.now()
    animationFrameId = scheduler.requestFrame(advanceFrame)
  }

  const advanceFrame = (timestamp: number): void => {
    animationFrameId = null
    const impulsedSurfaces = new Set<WorkbenchNodeHoverMotionSurface>()
    const pointerSample = pendingPointerSample
    pendingPointerSample = null
    if (pointerSample && lastPointerPosition) {
      const impulseX = resolveWorkbenchHoverImpulse(
        pointerSample.position.x - lastPointerPosition.x
      )
      const impulseY = resolveWorkbenchHoverImpulse(
        pointerSample.position.y - lastPointerPosition.y
      )
      lastPointerPosition = pointerSample.position

      if (pointerSample.surface && (impulseX !== 0 || impulseY !== 0)) {
        const state = surfaceStates.get(pointerSample.surface) ?? {
          x: { value: 0, velocity: 0 },
          y: { value: 0, velocity: 0 }
        }
        state.x = applyImpulse(state.x, impulseX)
        state.y = applyImpulse(state.y, impulseY)
        surfaceStates.set(pointerSample.surface, state)
        impulsedSurfaces.add(pointerSample.surface)
      }
    }

    const deltaSeconds = clamp((timestamp - lastFrameTimestamp) / 1000, 0, maximumFrameDeltaSeconds)
    lastFrameTimestamp = timestamp

    surfaceStates.forEach((state, surface) => {
      if (!impulsedSurfaces.has(surface)) {
        state.x = constrainAxis(
          advanceCriticalSpringAxis(state.x, 0, hoverMotionResponse, deltaSeconds)
        )
        state.y = constrainAxis(
          advanceCriticalSpringAxis(state.y, 0, hoverMotionResponse, deltaSeconds)
        )
      }

      if (
        isCriticalSpringAxisSettled(state.x, 0, settlementThresholds) &&
        isCriticalSpringAxisSettled(state.y, 0, settlementThresholds)
      ) {
        surfaceStates.delete(surface)
        clearSurface(surface)
        return
      }

      presentSurface(surface, state)
    })

    scheduleFrame()
  }

  const suspend = (): void => {
    if (animationFrameId !== null) scheduler.cancelFrame(animationFrameId)
    animationFrameId = null
    surfaceStates.forEach((_state, surface) => clearSurface(surface))
    surfaceStates.clear()
    lastPointerPosition = null
    pendingPointerSample = null
  }

  return {
    dispose: suspend,
    pointerMoved: (surface, position) => {
      if (!surface) {
        lastPointerPosition = position
        pendingPointerSample = null
        return
      }

      if (!lastPointerPosition) {
        lastPointerPosition = position
        return
      }

      pendingPointerSample = { position, surface }
      scheduleFrame()
    },
    suspend
  }
}

function applyImpulse(axis: CriticalSpringAxis, impulse: number): CriticalSpringAxis {
  return constrainAxis({
    value: axis.value + impulse,
    velocity: axis.velocity + impulse * velocityHandoffMultiplier
  })
}

function constrainAxis(axis: CriticalSpringAxis): CriticalSpringAxis {
  const value = clamp(axis.value, -maximumHoverTranslation, maximumHoverTranslation)
  if (value === axis.value) return axis

  return {
    value,
    velocity: Math.sign(axis.velocity) === Math.sign(value) ? 0 : axis.velocity
  }
}

function roundMotionValue(value: number): number {
  return Math.round(value * 1000) / 1000
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum)
}
