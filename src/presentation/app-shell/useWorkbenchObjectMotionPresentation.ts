import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type CSSProperties
} from 'react'

import type { WorkbenchObjectMotion } from './types'

interface WorkbenchObjectMotionPresentation {
  readonly className: string
  readonly onAnimationEnd: (event: AnimationEvent<HTMLElement>) => void
  readonly style: CSSProperties | undefined
}

export function useWorkbenchObjectMotionPresentation(
  motion: WorkbenchObjectMotion | undefined,
  onComplete?: (motionId: string) => void
): WorkbenchObjectMotionPresentation {
  const [presentation, setPresentation] = useState(motion)
  const completedMotionIdRef = useRef<string | null>(null)

  useLayoutEffect(() => {
    if (motion && motion.id !== presentation?.id && motion.id !== completedMotionIdRef.current) {
      setPresentation(motion)
    }
  }, [motion, presentation?.id])

  const onAnimationEnd = useCallback(
    (event: AnimationEvent<HTMLElement>): void => {
      if (!presentation || event.target !== event.currentTarget) {
        return
      }

      completedMotionIdRef.current = presentation.id
      setPresentation(undefined)
      onComplete?.(presentation.id)
    },
    [onComplete, presentation]
  )

  return {
    className: presentation ? `workbench-object-motion--${presentation.kind}` : '',
    onAnimationEnd,
    style: presentation
      ? ({
          '--workbench-object-motion-x': `${presentation.offset.x}px`,
          '--workbench-object-motion-y': `${presentation.offset.y}px`
        } as CSSProperties)
      : undefined
  }
}
