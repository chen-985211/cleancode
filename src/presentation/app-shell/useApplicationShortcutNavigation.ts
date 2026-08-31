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
import type { ProjectSidebarIntent } from '../../contexts/project/presentation/components/ProjectSidebar'
import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import {
  resolveWorkbenchNodeFocusZoom,
  resolveWorkbenchNodeSize
} from './workbenchNodeFocusViewport'
import { transitionWorkbenchViewport } from './workbenchViewportMotion'

interface UseApplicationShortcutNavigationInput {
  readonly activateWorkbenchNodeInput: (node: WorkbenchFlowNode) => void
  readonly canvasSizeRef: MutableRefObject<CanvasSize>
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly getNodes: () => readonly WorkbenchFlowNode[]
  readonly onSelectWorkspace: (
    workbench: WorkbenchSnapshot,
    workspaceId: string
  ) => void | Promise<void>
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly revealProjectSidebar: () => void
  readonly selectedNodeId: string | null
  readonly selectWorkbenchNode: (node: WorkbenchFlowNode) => void
  readonly workbenches: readonly WorkbenchSnapshot[]
}

export function useApplicationShortcutNavigation({
  activateWorkbenchNodeInput,
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
  const previousShortcutSelectedNodeIdRef = useRef<string | null>(null)
  const previousShortcutDirectionRef = useRef<CanvasNavigationDirection | null>(null)
  const activateWorkbenchNodeInputRef = useRef(activateWorkbenchNodeInput)
  const selectWorkbenchNodeRef = useRef(selectWorkbenchNode)
  if (selectedNodeIdRef.current !== selectedNodeId) {
    selectedNodeIdRef.current = selectedNodeId
    previousShortcutSelectedNodeIdRef.current = null
    previousShortcutDirectionRef.current = null
  }
  activateWorkbenchNodeInputRef.current = activateWorkbenchNodeInput
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
      const currentSelectedNodeId = selectedNodeIdRef.current
      const target = resolveDirectionalWorkbenchNode(
        getNodes(),
        currentSelectedNodeId,
        viewport,
        canvasSizeRef.current,
        direction,
        previousShortcutSelectedNodeIdRef.current,
        previousShortcutDirectionRef.current
      )
      if (!target) {
        return
      }

      selectWorkbenchNodeRef.current(target)
      previousShortcutSelectedNodeIdRef.current = currentSelectedNodeId
      previousShortcutDirectionRef.current = direction
      selectedNodeIdRef.current = target.id
      const center = resolveWorkbenchNodeCenter(target)
      const zoom = resolveWorkbenchNodeFocusZoom({
        canvasSize: canvasSizeRef.current,
        currentZoom: viewport.zoom,
        nodeSize: resolveWorkbenchNodeSize(target)
      })
      const transitionCompletion = transitionWorkbenchViewport(instance, {
        center,
        intent: {
          canvasSize: canvasSizeRef.current,
          type: 'adaptive-focus'
        },
        type: 'center',
        zoom
      })
      activateWorkbenchNodeInputRef.current(target)
      void transitionCompletion.then((completed) => {
        if (completed && selectedNodeIdRef.current === target.id) {
          activateWorkbenchNodeInputRef.current(target)
        }
      })
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
        await onSelectWorkspace(target.workbench, target.workspaceId)
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
