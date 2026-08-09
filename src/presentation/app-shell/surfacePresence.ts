export type SurfaceMotionPhase = 'closed' | 'opening' | 'open' | 'closing'

export interface SurfacePresenceInput {
  readonly open: boolean
  readonly reducedMotion: boolean
}

export interface SurfacePresenceState extends SurfacePresenceInput {
  readonly motionId: number
  readonly phase: SurfaceMotionPhase
}

export function createSurfacePresenceState(input: SurfacePresenceInput): SurfacePresenceState {
  return {
    ...input,
    motionId: input.open && !input.reducedMotion ? 1 : 0,
    phase: input.open ? (input.reducedMotion ? 'open' : 'opening') : 'closed'
  }
}

export function synchronizeSurfacePresence(
  state: SurfacePresenceState,
  input: SurfacePresenceInput
): SurfacePresenceState {
  const phase = resolveSynchronizedPhase(state.phase, input)
  if (
    phase === state.phase &&
    input.open === state.open &&
    input.reducedMotion === state.reducedMotion
  ) {
    return state
  }

  return {
    ...input,
    motionId: phase === state.phase ? state.motionId : state.motionId + 1,
    phase
  }
}

export function completeSurfacePresenceMotion(
  state: SurfacePresenceState,
  motionId: number
): SurfacePresenceState {
  if (motionId !== state.motionId || state.reducedMotion) return state
  if (state.phase === 'opening') return { ...state, phase: 'open' }
  if (state.phase === 'closing') return { ...state, phase: 'closed' }
  return state
}

function resolveSynchronizedPhase(
  phase: SurfaceMotionPhase,
  input: SurfacePresenceInput
): SurfaceMotionPhase {
  if (input.reducedMotion) return input.open ? 'open' : 'closed'
  if (input.open) return phase === 'open' || phase === 'opening' ? phase : 'opening'
  return phase === 'closed' || phase === 'closing' ? phase : 'closing'
}
