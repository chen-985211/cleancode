import { useEffect, useLayoutEffect, useMemo, type RefObject } from 'react'

import {
  createSurfaceSpringMotionController,
  type SurfaceSpringPreset
} from './surfaceSpringMotion'
import type { SurfaceMotionPresence } from './useSurfaceMotionPresence'

export function useSurfaceSpringMotion(
  open: boolean,
  rootRef: RefObject<HTMLDivElement | null>,
  presence: SurfaceMotionPresence,
  preset: SurfaceSpringPreset | undefined
): void {
  const controller = useMemo(
    () => (preset ? createSurfaceSpringMotionController({ preset }) : null),
    [preset]
  )
  const completeMotion = presence.completeMotion
  const motionId = presence.motionId
  const reducedMotion = presence.reducedMotion

  useLayoutEffect(() => {
    if (!controller) return
    controller.intentChanged(rootRef.current, {
      onSettled: () => completeMotion(motionId),
      reducedMotion,
      visible: open
    })
  }, [completeMotion, controller, motionId, open, reducedMotion, rootRef])

  useEffect(() => () => controller?.dispose(), [controller])
}
