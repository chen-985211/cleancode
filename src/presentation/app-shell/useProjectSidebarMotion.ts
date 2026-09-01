import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react'

import { createProjectSidebarMotionController } from './projectSidebarMotion'
import type { TerminalRenderingWorkloadCoordinator } from './coordinators/terminalRenderingWorkloadCoordinator'
import { usePrefersReducedMotion } from '../shared/hooks/usePrefersReducedMotion'

const fallbackExpandedWidth = 280

export interface ProjectSidebarMotionRefs {
  readonly centerRef: RefObject<HTMLDivElement | null>
  readonly sidebarRef: RefObject<HTMLDivElement | null>
  readonly spatialRef: RefObject<HTMLDivElement | null>
  readonly statusbarRef: RefObject<HTMLElement | null>
  readonly titlebarRef: RefObject<HTMLDivElement | null>
}

export function useProjectSidebarMotion(
  isCollapsed: boolean,
  workloadCoordinator?: Pick<TerminalRenderingWorkloadCoordinator, 'setSidebarMotionActive'>
): ProjectSidebarMotionRefs {
  const sidebarRef = useRef<HTMLDivElement | null>(null)
  const titlebarRef = useRef<HTMLDivElement | null>(null)
  const spatialRef = useRef<HTMLDivElement | null>(null)
  const centerRef = useRef<HTMLDivElement | null>(null)
  const statusbarRef = useRef<HTMLElement | null>(null)
  const workloadCoordinatorRef = useRef(workloadCoordinator)
  workloadCoordinatorRef.current = workloadCoordinator
  const controller = useMemo(
    () =>
      createProjectSidebarMotionController({
        onMotionActiveChange: (isActive) =>
          workloadCoordinatorRef.current?.setSidebarMotionActive(isActive)
      }),
    []
  )
  const reducedMotion = usePrefersReducedMotion()

  useLayoutEffect(() => {
    const root = sidebarRef.current?.closest<HTMLElement>('.app-shell') ?? null
    controller.intentChanged(
      {
        center: centerRef.current,
        sidebar: sidebarRef.current,
        spatial: spatialRef.current,
        statusbar: statusbarRef.current,
        titlebar: titlebarRef.current
      },
      {
        expandedWidth: readExpandedWidth(root),
        isCollapsed,
        reducedMotion
      }
    )
  }, [controller, isCollapsed, reducedMotion])

  useEffect(() => () => controller.dispose(), [controller])

  return { centerRef, sidebarRef, spatialRef, statusbarRef, titlebarRef }
}

function readExpandedWidth(root: HTMLElement | null): number {
  if (!root) return fallbackExpandedWidth
  const value = Number.parseFloat(
    window.getComputedStyle(root).getPropertyValue('--cc-sidebar-expanded-width')
  )
  return Number.isFinite(value) && value > 0 ? value : fallbackExpandedWidth
}
