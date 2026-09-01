import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties,
  type RefCallback
} from 'react'

import type { WorkbenchObjectMotion } from './types/workbenchObjectMotion'
import { createWorkbenchObjectSpringController } from './workbenchObjectSpring'
import { usePrefersReducedMotion } from '../shared/hooks/usePrefersReducedMotion'

interface WorkbenchObjectMotionPresentation {
  readonly className: string
  readonly onAnimationEnd: (event: AnimationEvent<HTMLElement>) => void
  readonly surfaceRef: RefCallback<HTMLElement>
  readonly style: CSSProperties | undefined
}

export function useWorkbenchObjectMotionPresentation(
  motion: WorkbenchObjectMotion | undefined,
  onComplete?: (motionId: string) => void
): WorkbenchObjectMotionPresentation {
  const [presentation, setPresentation] = useState(motion)
  const [surfaceElement, setSurfaceElement] = useState<HTMLElement | null>(null)
  const completedMotionIdRef = useRef<string | null>(null)
  const onCompleteRef = useRef(onComplete)
  const controller = useMemo(() => createWorkbenchObjectSpringController(), [])
  const reducedMotion = usePrefersReducedMotion()
  onCompleteRef.current = onComplete

  useLayoutEffect(() => {
    if (!motion && presentation?.kind === 'delete') {
      setPresentation(undefined)
      return
    }
    if (motion && motion.id !== presentation?.id && motion.id !== completedMotionIdRef.current) {
      setPresentation(motion)
    }
  }, [motion, presentation?.id])

  const completeSpatialMotion = useCallback((motionId: string): void => {
    completedMotionIdRef.current = motionId
    setPresentation((currentPresentation) =>
      currentPresentation?.id === motionId ? undefined : currentPresentation
    )
    onCompleteRef.current?.(motionId)
  }, [])

  const surfaceRef = useCallback<RefCallback<HTMLElement>>((surface) => {
    setSurfaceElement(surface)
  }, [])

  useLayoutEffect(() => {
    controller.motionChanged(
      surfaceElement,
      presentation ?? null,
      reducedMotion,
      completeSpatialMotion
    )
  }, [completeSpatialMotion, controller, presentation, reducedMotion, surfaceElement])

  useEffect(() => () => controller.dispose(), [controller])

  const onAnimationEnd = useCallback(
    (event: AnimationEvent<HTMLElement>): void => {
      if (
        !presentation ||
        presentation.kind !== 'create' ||
        presentation.scale ||
        event.target !== event.currentTarget
      ) {
        return
      }

      completedMotionIdRef.current = presentation.id
      setPresentation(undefined)
      onCompleteRef.current?.(presentation.id)
    },
    [presentation]
  )

  return {
    className: presentation
      ? [
          `workbench-object-motion--${presentation.kind}`,
          presentation.kind === 'create' && !presentation.scale
            ? ''
            : 'workbench-object-motion--spatial'
        ]
          .filter(Boolean)
          .join(' ')
      : '',
    onAnimationEnd,
    surfaceRef,
    style: undefined
  }
}
