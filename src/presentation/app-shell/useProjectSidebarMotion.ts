import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'

import { createProjectSidebarMotionController } from './projectSidebarMotion'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

const fallbackExpandedWidth = 280

export function useProjectSidebarMotion(isCollapsed: boolean): RefObject<HTMLElement | null> {
  const sidebarRef = useRef<HTMLElement | null>(null)
  const controller = useMemo(() => createProjectSidebarMotionController(), [])
  const reducedMotion = usePrefersReducedMotion()

  useLayoutEffect(() => {
    const root = sidebarRef.current?.closest<HTMLElement>('.app-shell') ?? null
    controller.intentChanged(root, {
      expandedWidth: readExpandedWidth(root),
      isCollapsed,
      reducedMotion
    })
  }, [controller, isCollapsed, reducedMotion])

  useEffect(() => () => controller.dispose(), [controller])

  return sidebarRef
}

function readExpandedWidth(root: HTMLElement | null): number {
  if (!root) return fallbackExpandedWidth
  const value = Number.parseFloat(
    window.getComputedStyle(root).getPropertyValue('--cc-sidebar-expanded-width')
  )
  return Number.isFinite(value) && value > 0 ? value : fallbackExpandedWidth
}
