import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useRef, useState, type MutableRefObject } from 'react'

import {
  resolveAdjacentWorkspaceTarget,
  resolvePannedCanvasViewport,
  type CanvasPanDirection,
  type WorkspaceNavigationDirection
} from './applicationShortcutNavigation'
import type { ProjectSidebarIntent } from './ProjectSidebar'
import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'

interface UseApplicationShortcutNavigationInput {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly onSelectWorkspace: (
    workbench: WorkbenchSnapshot,
    workspaceName: string
  ) => void | Promise<void>
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly revealProjectSidebar: () => void
  readonly workbenches: readonly WorkbenchSnapshot[]
}

export function useApplicationShortcutNavigation({
  currentWorkbench,
  onSelectWorkspace,
  reactFlowInstanceRef,
  revealProjectSidebar,
  workbenches
}: UseApplicationShortcutNavigationInput) {
  const [isMinimapCollapsed, setIsMinimapCollapsed] = useState(false)
  const [projectSidebarIntent, setProjectSidebarIntent] = useState<ProjectSidebarIntent | null>(
    null
  )
  const intentIdRef = useRef(0)
  const isWorkspaceTransitionPendingRef = useRef(false)

  const revealProject = useCallback(
    (projectId: string, type: ProjectSidebarIntent['type']): void => {
      intentIdRef.current += 1
      revealProjectSidebar()
      setProjectSidebarIntent({ id: intentIdRef.current, projectId, type })
    },
    [revealProjectSidebar]
  )

  const panCanvas = useCallback(
    (direction: CanvasPanDirection): void => {
      const instance = reactFlowInstanceRef.current
      if (!instance) {
        return
      }

      void instance.setViewport(
        resolvePannedCanvasViewport(instance.getViewport(), direction, 160),
        {
          duration: 160
        }
      )
    },
    [reactFlowInstanceRef]
  )

  const navigateWorkspace = useCallback(
    async (direction: WorkspaceNavigationDirection): Promise<void> => {
      if (isWorkspaceTransitionPendingRef.current) {
        return
      }

      const target = resolveAdjacentWorkspaceTarget(workbenches, currentWorkbench, direction)
      if (!target) {
        return
      }

      isWorkspaceTransitionPendingRef.current = true
      revealProject(target.workbench.project.id, 'revealProject')
      try {
        await onSelectWorkspace(target.workbench, target.workspaceName)
      } finally {
        isWorkspaceTransitionPendingRef.current = false
      }
    },
    [currentWorkbench, onSelectWorkspace, revealProject, workbenches]
  )

  const requestBranchWorkspaceCreation = useCallback((): void => {
    if (currentWorkbench) {
      revealProject(currentWorkbench.project.id, 'createBranchWorkspace')
    }
  }, [currentWorkbench, revealProject])

  const toggleMinimap = useCallback((): void => {
    setIsMinimapCollapsed((collapsed) => !collapsed)
  }, [])

  return {
    isMinimapCollapsed,
    navigateWorkspace,
    panCanvas,
    projectSidebarIntent,
    requestBranchWorkspaceCreation,
    toggleMinimap
  }
}
