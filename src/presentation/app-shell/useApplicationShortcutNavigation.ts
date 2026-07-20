import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'

import {
  resolveAdjacentWorkspaceTarget,
  resolveContinuousCanvasPanViewport,
  type CanvasPanDirection,
  type WorkspaceNavigationDirection
} from './applicationShortcutNavigation'
import type { ProjectSidebarIntent } from './ProjectSidebar'
import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'

const canvasPanPixelsPerSecond = 720
const canvasPanInitialElapsedMs = 16
const canvasPanMaximumFrameElapsedMs = 32

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
  const activePanDirectionsRef = useRef(new Set<CanvasPanDirection>())
  const panAnimationFrameRef = useRef<number | null>(null)
  const previousPanFrameTimeRef = useRef<number | null>(null)

  const revealProject = useCallback(
    (projectId: string, type: ProjectSidebarIntent['type']): void => {
      intentIdRef.current += 1
      revealProjectSidebar()
      setProjectSidebarIntent({ id: intentIdRef.current, projectId, type })
    },
    [revealProjectSidebar]
  )

  const applyPan = useCallback(
    (elapsedMs: number): void => {
      const instance = reactFlowInstanceRef.current
      if (!instance) {
        return
      }

      void instance.setViewport(
        resolveContinuousCanvasPanViewport(
          instance.getViewport(),
          [...activePanDirectionsRef.current],
          canvasPanPixelsPerSecond,
          elapsedMs
        )
      )
    },
    [reactFlowInstanceRef]
  )

  const advancePanFrame = useCallback(
    function advancePanFrame(timestamp: number): void {
      if (activePanDirectionsRef.current.size === 0 || !reactFlowInstanceRef.current) {
        panAnimationFrameRef.current = null
        previousPanFrameTimeRef.current = null
        return
      }

      const previousTimestamp = previousPanFrameTimeRef.current ?? timestamp
      const elapsedMs = Math.min(
        Math.max(timestamp - previousTimestamp, 0),
        canvasPanMaximumFrameElapsedMs
      )
      previousPanFrameTimeRef.current = timestamp
      if (elapsedMs > 0) {
        applyPan(elapsedMs)
      }
      panAnimationFrameRef.current = window.requestAnimationFrame(advancePanFrame)
    },
    [applyPan, reactFlowInstanceRef]
  )

  const startPanCanvas = useCallback(
    (direction: CanvasPanDirection): void => {
      if (!reactFlowInstanceRef.current || activePanDirectionsRef.current.has(direction)) {
        return
      }

      activePanDirectionsRef.current.add(direction)
      if (panAnimationFrameRef.current !== null) {
        return
      }

      applyPan(canvasPanInitialElapsedMs)
      previousPanFrameTimeRef.current = performance.now()
      panAnimationFrameRef.current = window.requestAnimationFrame(advancePanFrame)
    },
    [advancePanFrame, applyPan, reactFlowInstanceRef]
  )

  const stopPanCanvas = useCallback((direction: CanvasPanDirection): void => {
    activePanDirectionsRef.current.delete(direction)
    if (activePanDirectionsRef.current.size > 0) {
      return
    }

    if (panAnimationFrameRef.current !== null) {
      window.cancelAnimationFrame(panAnimationFrameRef.current)
    }
    panAnimationFrameRef.current = null
    previousPanFrameTimeRef.current = null
  }, [])

  useEffect(
    () => () => {
      activePanDirectionsRef.current.clear()
      if (panAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(panAnimationFrameRef.current)
      }
    },
    []
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
    startPanCanvas,
    stopPanCanvas,
    toggleMinimap
  }
}
