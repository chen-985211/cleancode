import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'

import { usePrefersReducedMotion } from '../../../../presentation/shared/hooks/usePrefersReducedMotion'
import { createSpringProgressMotionController } from '../../../../presentation/shared/motion/springProgressMotion'

export function ProjectCurrentMarker({ current }: { readonly current: boolean }) {
  const rootRef = useRef<SVGSVGElement | null>(null)
  const hasPresentedRef = useRef(false)
  const reducedMotion = usePrefersReducedMotion()
  const controller = useMemo(
    () =>
      createSpringProgressMotionController({
        clear: (root) => root.style.removeProperty('--cc-project-marker-progress'),
        dynamics: { dampingRatio: 1, response: 0.42 },
        retargetPolicy: 'preserve',
        stateAttribute: 'data-project-marker-motion-state'
      }),
    []
  )
  const markerRef = useCallback(
    (element: SVGSVGElement | null): void => {
      rootRef.current = element
      if (element) return
      controller.dispose()
      hasPresentedRef.current = false
    },
    [controller]
  )

  useLayoutEffect(() => {
    controller.intentChanged(rootRef.current, {
      onSettled: () => undefined,
      present: (root, progress) => {
        root.style.setProperty('--cc-project-marker-progress', `${progress}`)
      },
      reducedMotion: reducedMotion || !hasPresentedRef.current,
      visible: current
    })
    hasPresentedRef.current = true
  }, [controller, current, reducedMotion])

  return (
    <svg
      ref={markerRef}
      className={current ? 'project-dot project-dot--active' : 'project-dot'}
      width="7"
      height="12"
      viewBox="0 0 7 12"
      aria-hidden="true"
    >
      <rect className="project-dot__shape" />
    </svg>
  )
}
