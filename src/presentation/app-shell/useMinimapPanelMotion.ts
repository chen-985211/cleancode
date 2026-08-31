import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'

import { createMinimapPanelMotionController } from './minimapPanelMotion'
import { usePrefersReducedMotion } from '../shared/hooks/usePrefersReducedMotion'
import { useSurfaceMotionPresence } from '../shared/hooks/useSurfaceMotionPresence'

export function useMinimapPanelMotion(expanded: boolean) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const controller = useMemo(() => createMinimapPanelMotionController(), [])
  const reducedMotion = usePrefersReducedMotion()
  const presence = useSurfaceMotionPresence(expanded)
  const completeMotion = presence.completeMotion
  const motionId = presence.motionId

  useLayoutEffect(() => {
    controller.intentChanged(rootRef.current, {
      expanded,
      reducedMotion,
      onSettled: () => completeMotion(motionId)
    })
  }, [completeMotion, controller, expanded, motionId, reducedMotion])

  useEffect(() => () => controller.dispose(), [controller])

  return {
    isPresent: presence.isPresent,
    rootRef,
    surfaceProps: presence.surfaceProps
  }
}
