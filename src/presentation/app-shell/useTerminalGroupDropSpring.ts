import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'

import { createTerminalGroupDropSpringController } from './terminalGroupDropSpring'
import { prefersReducedMotion } from './workbenchViewportMotionEnvironment'

export function useTerminalGroupDropSpring(isEngaged: boolean): RefObject<HTMLElement | null> {
  const surfaceRef = useRef<HTMLElement | null>(null)
  const controller = useMemo(() => createTerminalGroupDropSpringController(), [])

  useLayoutEffect(() => {
    const surface = surfaceRef.current
    if (!surface || prefersReducedMotion()) {
      controller.suspend()
      return
    }

    controller.engagedSurfaceChanged(isEngaged ? surface : null)
  }, [controller, isEngaged])

  useEffect(() => () => controller.dispose(), [controller])

  return surfaceRef
}
