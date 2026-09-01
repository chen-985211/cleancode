import { createPortal } from 'react-dom'
import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type AnimationEventHandler,
  type HTMLAttributes,
  type TransitionEventHandler
} from 'react'

import {
  useSurfaceMotionPresence,
  type SurfaceMotionPreference
} from '../hooks/useSurfaceMotionPresence'
import { useSurfaceSpringMotion } from '../hooks/useSurfaceSpringMotion'
import { acquireSurfaceIsolationLease } from '../motion/surfaceIsolation'
import type { SurfaceSpringPreset } from '../motion/surfaceSpringMotion'

export type { SurfaceMotionPreferenceSource } from '../hooks/useSurfaceMotionPresence'

type SurfaceMotionDivProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'aria-hidden' | 'inert' | 'onAnimationEnd' | 'onTransitionEnd'
> & {
  readonly motionPreference?: SurfaceMotionPreference
  readonly onAnimationEnd?: AnimationEventHandler<HTMLDivElement>
  readonly onExitComplete?: () => void
  readonly onTransitionEnd?: TransitionEventHandler<HTMLDivElement>
  readonly open: boolean
  readonly springPreset?: SurfaceSpringPreset
}

export interface AnchoredSurfaceMotionProps extends SurfaceMotionDivProps {
  readonly portalContainer?: Element
}

export const AnchoredSurfaceMotion = forwardRef<HTMLDivElement, AnchoredSurfaceMotionProps>(
  function AnchoredSurfaceMotion(
    {
      motionPreference,
      onAnimationEnd,
      onExitComplete,
      onTransitionEnd,
      open,
      portalContainer,
      springPreset,
      ...elementProps
    },
    ref
  ) {
    const presence = useSurfaceMotionPresence(open, { motionPreference, onExitComplete })
    const rootRef = useRef<HTMLDivElement | null>(null)
    useImperativeHandle(ref, () => rootRef.current as HTMLDivElement)
    useSurfaceSpringMotion(open, rootRef, presence, springPreset)
    if (!presence.isPresent) return null

    const surface = (
      <div
        {...elementProps}
        {...presence.surfaceProps}
        data-surface-spring-preset={springPreset}
        onAnimationEnd={(event) => {
          onAnimationEnd?.(event)
          presence.surfaceProps.onAnimationEnd(event)
        }}
        onTransitionEnd={(event) => {
          onTransitionEnd?.(event)
          presence.surfaceProps.onTransitionEnd(event)
        }}
        ref={rootRef}
      />
    )
    return portalContainer ? createPortal(surface, portalContainer) : surface
  }
)

export type SurfaceIsolationTargets = readonly HTMLElement[] | (() => readonly HTMLElement[])

export interface OverlaySurfaceMotionProps extends SurfaceMotionDivProps {
  readonly isolationTargets?: SurfaceIsolationTargets
  readonly portalContainer?: Element
}

export const OverlaySurfaceMotion = forwardRef<HTMLDivElement, OverlaySurfaceMotionProps>(
  function OverlaySurfaceMotion(
    {
      isolationTargets,
      motionPreference,
      onAnimationEnd,
      onExitComplete,
      onTransitionEnd,
      open,
      portalContainer,
      springPreset,
      ...elementProps
    },
    ref
  ) {
    const presence = useSurfaceMotionPresence(open, { motionPreference, onExitComplete })
    const rootRef = useRef<HTMLDivElement | null>(null)
    useImperativeHandle(ref, () => rootRef.current as HTMLDivElement)
    useSurfaceSpringMotion(open, rootRef, presence, springPreset)
    useSurfaceIsolation(open, isolationTargets)
    if (!presence.isPresent) return null

    const surface = (
      <div
        {...elementProps}
        {...presence.surfaceProps}
        data-surface-spring-preset={springPreset}
        onAnimationEnd={(event) => {
          onAnimationEnd?.(event)
          presence.surfaceProps.onAnimationEnd(event)
        }}
        onTransitionEnd={(event) => {
          onTransitionEnd?.(event)
          presence.surfaceProps.onTransitionEnd(event)
        }}
        ref={rootRef}
      />
    )
    return createPortal(surface, portalContainer ?? document.body)
  }
)

function useSurfaceIsolation(
  isPresent: boolean,
  isolationTargets: SurfaceIsolationTargets | undefined
): void {
  useLayoutEffect(() => {
    if (!isPresent) return undefined
    const targets = resolveSurfaceIsolationTargets(isolationTargets)
    return targets.length > 0 ? acquireSurfaceIsolationLease(targets) : undefined
  }, [isPresent, isolationTargets])
}

function resolveSurfaceIsolationTargets(
  isolationTargets: SurfaceIsolationTargets | undefined
): readonly HTMLElement[] {
  if (typeof isolationTargets === 'function') return isolationTargets()
  if (isolationTargets) return isolationTargets
  const root = document.getElementById('root')
  return root ? [root] : []
}
