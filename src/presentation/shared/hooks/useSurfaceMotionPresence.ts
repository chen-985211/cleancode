import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type AnimationEventHandler,
  type TransitionEventHandler
} from 'react'

import { motionPreferenceStore } from '../motion/motionPreference'
import {
  completeSurfacePresenceMotion,
  createSurfacePresenceState,
  synchronizeSurfacePresence,
  type SurfaceMotionPhase,
  type SurfacePresenceInput,
  type SurfacePresenceState
} from '../motion/surfacePresence'

export interface SurfaceMotionPreferenceSource {
  readonly getSnapshot: () => boolean
  readonly subscribe: (listener: () => void) => () => void
}

export type SurfaceMotionPreference = boolean | SurfaceMotionPreferenceSource

export interface UseSurfaceMotionPresenceOptions {
  readonly motionPreference?: SurfaceMotionPreference
  readonly onExitComplete?: () => void
}

interface SurfaceMotionElementProps {
  readonly 'aria-hidden': true | undefined
  readonly 'data-surface-motion-state': SurfaceMotionPhase
  readonly inert: boolean
  readonly onAnimationEnd: AnimationEventHandler<HTMLElement>
  readonly onTransitionEnd: TransitionEventHandler<HTMLElement>
}

export interface SurfaceMotionPresence {
  readonly completeMotion: (motionId?: number) => void
  readonly isPresent: boolean
  readonly motionId: number
  readonly phase: SurfaceMotionPhase
  readonly reducedMotion: boolean
  readonly surfaceProps: SurfaceMotionElementProps
}

interface RenderedSurfacePresence {
  readonly input: SurfacePresenceInput
  readonly state: SurfacePresenceState
}

export function useSurfaceMotionPresence(
  isOpen: boolean,
  options: UseSurfaceMotionPresenceOptions = {}
): SurfaceMotionPresence {
  const reducedMotion = useSurfaceMotionPreference(options.motionPreference)
  const input: SurfacePresenceInput = { open: isOpen, reducedMotion }
  const [renderedPresence, setRenderedPresence] = useState<RenderedSurfacePresence>(() => ({
    input,
    state: createSurfacePresenceState(input)
  }))
  const inputChanged =
    renderedPresence.input.open !== input.open ||
    renderedPresence.input.reducedMotion !== input.reducedMotion
  const state = inputChanged
    ? synchronizeSurfacePresence(renderedPresence.state, input)
    : renderedPresence.state
  if (inputChanged) setRenderedPresence({ input, state })

  const isPresent = state.phase !== 'closed'
  const wasPresentRef = useRef(isPresent)
  useLayoutEffect(() => {
    if (isPresent) {
      wasPresentRef.current = true
      return
    }
    if (!wasPresentRef.current) return
    wasPresentRef.current = false
    options.onExitComplete?.()
  }, [isPresent, options.onExitComplete])

  const completeMotion = useCallback((expectedMotionId?: number): void => {
    setRenderedPresence((currentPresence) => {
      const nextState = completeSurfacePresenceMotion(
        currentPresence.state,
        expectedMotionId ?? currentPresence.state.motionId
      )
      return nextState === currentPresence.state
        ? currentPresence
        : { ...currentPresence, state: nextState }
    })
  }, [])
  const completeCurrentMotion = useCallback<TransitionEventHandler<HTMLElement>>(
    (event) => {
      if (event.target !== event.currentTarget) return
      completeMotion(state.motionId)
    },
    [completeMotion, state.motionId]
  )
  const completeCurrentAnimation = useCallback<AnimationEventHandler<HTMLElement>>(
    (event) => {
      if (event.target !== event.currentTarget) return
      completeMotion(state.motionId)
    },
    [completeMotion, state.motionId]
  )
  const isInteractive = isOpen && (state.phase === 'opening' || state.phase === 'open')
  const surfaceProps = useMemo<SurfaceMotionElementProps>(
    () => ({
      'aria-hidden': isInteractive ? undefined : true,
      'data-surface-motion-state': state.phase,
      inert: !isInteractive,
      onAnimationEnd: completeCurrentAnimation,
      onTransitionEnd: completeCurrentMotion
    }),
    [completeCurrentAnimation, completeCurrentMotion, isInteractive, state.phase]
  )

  return {
    completeMotion,
    isPresent,
    motionId: state.motionId,
    phase: state.phase,
    reducedMotion,
    surfaceProps
  }
}

function useSurfaceMotionPreference(preference: SurfaceMotionPreference | undefined): boolean {
  const resolvedPreference = preference ?? motionPreferenceStore
  const subscribe = useCallback(
    (listener: () => void) =>
      typeof resolvedPreference === 'object'
        ? resolvedPreference.subscribe(listener)
        : () => undefined,
    [resolvedPreference]
  )
  const getSnapshot = useCallback(
    () =>
      typeof resolvedPreference === 'object'
        ? resolvedPreference.getSnapshot()
        : resolvedPreference,
    [resolvedPreference]
  )
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
