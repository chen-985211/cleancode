import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'

import { createTerminalGroupDropSpringController } from './terminalGroupDropSpring'
import type { TerminalGroupDropFeedback } from './types'
import { prefersReducedMotion } from './workbenchViewportMotionEnvironment'

export function useTerminalGroupDropSpring(
  feedback: TerminalGroupDropFeedback | null
): RefObject<HTMLElement | null> {
  const surfaceRef = useRef<HTMLElement | null>(null)
  const controller = useMemo(() => createTerminalGroupDropSpringController(), [])

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface || prefersReducedMotion()) {
      controller.suspend()
      return
    }

    controller.feedbackChanged(surface, feedback)
  }, [controller, feedback])

  useEffect(() => () => controller.dispose(), [controller])

  return surfaceRef
}
