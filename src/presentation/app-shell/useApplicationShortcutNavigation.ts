import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useRef, useState, type MutableRefObject } from 'react'

import {
  resolveAdjacentWorkspaceTarget,
  resolveDirectionalWorkbenchNode,
  resolveWorkbenchNodeCenter,
  type CanvasNavigationDirection,
  type CanvasSize,
  type WorkspaceNavigationDirection
} from './applicationShortcutNavigation'
import type { ProjectSidebarIntent } from './ProjectSidebar'
import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'

interface UseApplicationShortcutNavigationInput {
  readonly canvasSizeRef: MutableRefObject<CanvasSize>
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly getNodes: () => readonly WorkbenchFlowNode[]
  readonly onSelectWorkspace: (
    workbench: WorkbenchSnapshot,
    workspaceName: string
  ) => void | Promise<void>
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly revealProjectSidebar: () => void
  readonly selectedNodeId: string | null
  readonly selectWorkbenchNode: (node: WorkbenchFlowNode) => void
  readonly workbenches: readonly WorkbenchSnapshot[]
}

export function useApplicationShortcutNavigation({
  canvasSizeRef,
  currentWorkbench,
  getNodes,
  onSelectWorkspace,
  reactFlowInstanceRef,
  revealProjectSidebar,
  selectedNodeId,
  selectWorkbenchNode,
  workbenches
}: UseApplicationShortcutNavigationInput) {
  const [isMinimapCollapsed, setIsMinimapCollapsed] = useState(false)
  const [projectSidebarIntent, setProjectSidebarIntent] = useState<ProjectSidebarIntent | null>(
    null
  )
  const intentIdRef = useRef(0)
  const isWorkspaceTransitionPendingRef = useRef(false)
  const selectedNodeIdRef = useRef(selectedNodeId)
  const selectWorkbenchNodeRef = useRef(selectWorkbenchNode)
  selectedNodeIdRef.current = selectedNodeId
  selectWorkbenchNodeRef.current = selectWorkbenchNode

  const revealProject = useCallback(
    (projectId: string, type: ProjectSidebarIntent['type']): void => {
      intentIdRef.current += 1
      revealProjectSidebar()
      setProjectSidebarIntent({ id: intentIdRef.current, projectId, type })
    },
    [revealProjectSidebar]
  )

  const selectCanvasNode = useCallback(
    (direction: CanvasNavigationDirection): void => {
      const instance = reactFlowInstanceRef.current
      if (!instance) {
        return
      }

      const viewport = instance.getViewport()
      const target = resolveDirectionalWorkbenchNode(
        getNodes(),
        selectedNodeIdRef.current,
        viewport,
        canvasSizeRef.current,
        direction
      )
      if (!target) {
        return
      }

      selectWorkbenchNodeRef.current(target)
      const center = resolveWorkbenchNodeCenter(target)
      void instance.setCenter(center.x, center.y, { duration: 0, zoom: viewport.zoom })
    },
    [canvasSizeRef, getNodes, reactFlowInstanceRef]
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
    projectSidebarIntent,
    requestBranchWorkspaceCreation,
    selectCanvasNode,
    toggleMinimap
  }
}
