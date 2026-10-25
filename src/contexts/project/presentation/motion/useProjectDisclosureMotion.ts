import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'

import { usePrefersReducedMotion } from '../../../../presentation/shared/hooks/usePrefersReducedMotion'
import { createSpringProgressMotionController } from '../../../../presentation/shared/motion/springProgressMotion'

export function useProjectDisclosureMotion(expanded: boolean) {
  const rootRef = useRef<HTMLElement | null>(null)
  const hasPresentedRef = useRef(false)
  const reducedMotion = usePrefersReducedMotion()
  const controller = useMemo(
    () =>
      createSpringProgressMotionController({
        clear: (root) => {
          root.style.removeProperty('--project-disclosure-progress')
          root.style.removeProperty('--project-disclosure-rows')
        },
        dynamics: { dampingRatio: 1, response: 0.32 },
        stateAttribute: 'data-project-disclosure-state'
      }),
    []
  )
  const ref = useCallback(
    (element: HTMLElement | null) => {
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
        root.style.setProperty('--project-disclosure-progress', `${progress}`)
        root.style.setProperty('--project-disclosure-rows', `${progress}fr`)
      },
      reducedMotion: reducedMotion || !hasPresentedRef.current,
      visible: expanded
    })
    hasPresentedRef.current = true
  }, [controller, expanded, reducedMotion])

  return ref
}
