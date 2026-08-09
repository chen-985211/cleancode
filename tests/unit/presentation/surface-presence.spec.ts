import {
  completeSurfacePresenceMotion,
  createSurfacePresenceState,
  synchronizeSurfacePresence
} from '../../../src/presentation/app-shell/surfacePresence'

describe('surface presence state', () => {
  it('reuses one motion identity while redirecting between opening and closing', () => {
    let state = createSurfacePresenceState({ open: false, reducedMotion: false })

    expect(state).toMatchObject({ phase: 'closed', open: false })

    state = synchronizeSurfacePresence(state, { open: true, reducedMotion: false })
    const firstOpeningMotionId = state.motionId
    expect(state).toMatchObject({ phase: 'opening', open: true })

    state = synchronizeSurfacePresence(state, { open: false, reducedMotion: false })
    const closingMotionId = state.motionId
    expect(closingMotionId).toBeGreaterThan(firstOpeningMotionId)
    expect(state).toMatchObject({ phase: 'closing', open: false })

    state = synchronizeSurfacePresence(state, { open: true, reducedMotion: false })
    const redirectedOpeningMotionId = state.motionId
    expect(redirectedOpeningMotionId).toBeGreaterThan(closingMotionId)
    expect(state).toMatchObject({ phase: 'opening', open: true })

    expect(completeSurfacePresenceMotion(state, closingMotionId)).toBe(state)

    state = completeSurfacePresenceMotion(state, redirectedOpeningMotionId)
    expect(state).toMatchObject({ phase: 'open', open: true })

    state = synchronizeSurfacePresence(state, { open: false, reducedMotion: false })
    state = completeSurfacePresenceMotion(state, state.motionId)
    expect(state).toMatchObject({ phase: 'closed', open: false })
  })

  it('projects the current intent directly to a terminal phase when motion is reduced', () => {
    let state = createSurfacePresenceState({ open: true, reducedMotion: false })
    const openingMotionId = state.motionId

    state = synchronizeSurfacePresence(state, { open: true, reducedMotion: true })

    expect(state.motionId).toBeGreaterThan(openingMotionId)
    expect(state).toMatchObject({ phase: 'open', open: true, reducedMotion: true })
    expect(completeSurfacePresenceMotion(state, openingMotionId)).toBe(state)

    state = synchronizeSurfacePresence(state, { open: false, reducedMotion: true })
    expect(state).toMatchObject({ phase: 'closed', open: false, reducedMotion: true })
  })
})
