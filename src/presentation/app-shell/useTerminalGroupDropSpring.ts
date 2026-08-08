import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'

import { createTerminalGroupDropSpringController } from './terminalGroupDropSpring'
import type { TerminalGroupDropFeedback } from './types'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

export function useTerminalGroupDropSpring(
  feedback: TerminalGroupDropFeedback | null
): RefObject<HTMLElement | null> {
  const surfaceRef = useRef<HTMLElement | null>(null)
  const controller = useMemo(() => createTerminalGroupDropSpringController(), [])
  const reducedMotion = usePrefersReducedMotion()

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface || reducedMotion) {
      controller.suspend()
      return
    }

    controller.feedbackChanged(surface, feedback)
  }, [controller, feedback, reducedMotion])

  useEffect(() => () => controller.dispose(), [controller])

  return surfaceRef
}
