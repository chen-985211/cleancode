import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefCallback } from 'react'

import { createTerminalGroupDropSpringController } from './terminalGroupDropSpring'
import type { TerminalGroupDropFeedback } from './types'
import { usePrefersReducedMotion } from '../shared/hooks/usePrefersReducedMotion'

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
