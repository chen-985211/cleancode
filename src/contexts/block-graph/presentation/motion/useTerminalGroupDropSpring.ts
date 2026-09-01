import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefCallback } from 'react'

import { usePrefersReducedMotion } from '../../../../presentation/shared/hooks/usePrefersReducedMotion'
import type { TerminalGroupDropFeedback } from '../view-models/TerminalGroupPresentationTypes'
import { createTerminalGroupDropSpringController } from './terminalGroupDropSpring'

export function useTerminalGroupDropSpring(
  feedback: TerminalGroupDropFeedback | null
): RefCallback<HTMLElement> {
  const surfaceRef = useRef<HTMLElement | null>(null)
  const controller = useMemo(() => createTerminalGroupDropSpringController(), [])
  const reducedMotion = usePrefersReducedMotion()
  const setSurfaceRef = useCallback<RefCallback<HTMLElement>>((surface) => {
    surfaceRef.current = surface
  }, [])

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface || reducedMotion) {
      controller.suspend()
      return
    }

    controller.feedbackChanged(surface, feedback)
  }, [controller, feedback, reducedMotion])

  useEffect(() => () => controller.dispose(), [controller])

  return setSurfaceRef
}
