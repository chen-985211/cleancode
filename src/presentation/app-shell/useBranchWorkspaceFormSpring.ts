import { useEffect, useLayoutEffect, useMemo, type RefObject } from 'react'

import {
  createSpringProgressMotionController,
  type SpringProgressMotionRoot
} from './springProgressMotion'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import { useSurfaceMotionPresence } from './useSurfaceMotionPresence'

const opacityProperty = '--branch-workspace-motion-opacity'
const translationProperty = '--branch-workspace-motion-y'
const scaleProperty = '--branch-workspace-motion-scale'
const stateAttribute = 'data-branch-workspace-spring-state'

export function useBranchWorkspaceFormSpring(
  open: boolean,
  surfaceRef: RefObject<HTMLDivElement | null>,
  onExitComplete: () => void
) {
  const controller = useMemo(
    () =>
      createSpringProgressMotionController({
        clear: clearPresentation,
        dynamics: { dampingRatio: 1, response: 0.3 },
        stateAttribute
      }),
    []
  )
  const reducedMotion = usePrefersReducedMotion()
  const presence = useSurfaceMotionPresence(open, { onExitComplete })
  const completeMotion = presence.completeMotion
  const motionId = presence.motionId

  useLayoutEffect(() => {
    controller.intentChanged(surfaceRef.current, {
      onSettled: () => completeMotion(motionId),
      present: presentForm,
      reducedMotion,
      visible: open
    })
  }, [completeMotion, controller, motionId, open, reducedMotion, surfaceRef])

  useEffect(() => () => controller.dispose(), [controller])

  return presence
}

function presentForm(root: SpringProgressMotionRoot, progress: number): void {
  root.style.setProperty(opacityProperty, `${round(progress)}`)
  root.style.setProperty(translationProperty, `${round(-14 * (1 - progress))}px`)
  root.style.setProperty(scaleProperty, `${round(0.9 + 0.1 * progress)}`)
}

function clearPresentation(root: SpringProgressMotionRoot): void {
  root.style.removeProperty(opacityProperty)
  root.style.removeProperty(translationProperty)
  root.style.removeProperty(scaleProperty)
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000
}
