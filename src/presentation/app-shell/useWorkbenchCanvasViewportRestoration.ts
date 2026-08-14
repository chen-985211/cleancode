import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useEffect, type MutableRefObject } from 'react'

import type { WorkbenchFlowNode, WorkbenchSnapshot } from './types'
import { restoreCanvasViewport } from './workbenchCanvasViewport'
import type { TerminalZoomRasterCoordinator } from './terminalZoomRasterCoordinator'

export type TerminalZoomRasterCanvasCoordinator = Pick<
  TerminalZoomRasterCoordinator,
  'beginInteraction' | 'endInteraction' | 'updateCanvasZoom'
>

export function useWorkbenchCanvasViewportRestoration({
  currentWorkbench,
  isRestoringViewportRef,
  reactFlowInstanceRef,
  restoredGraphIdRef,
  projectCanvasViewport,
  terminalZoomRasterCoordinator
}: {
  readonly currentWorkbench: WorkbenchSnapshot | null
  readonly isRestoringViewportRef: MutableRefObject<boolean>
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
  readonly restoredGraphIdRef: MutableRefObject<string | null>
  readonly projectCanvasViewport: (viewport: WorkbenchSnapshot['graph']['viewport']) => void
  readonly terminalZoomRasterCoordinator?: TerminalZoomRasterCanvasCoordinator
}): void {
  useEffect(() => {
    const instance = reactFlowInstanceRef.current
    if (
      !instance ||
      !currentWorkbench ||
      restoredGraphIdRef.current === currentWorkbench.graph.id
    ) {
      return
    }

    terminalZoomRasterCoordinator?.updateCanvasZoom(currentWorkbench.graph.viewport.zoom)
    restoreCanvasViewport({
      instance,
      viewport: currentWorkbench.graph.viewport,
      graphId: currentWorkbench.graph.id,
      restoredGraphIdRef,
      isRestoringViewportRef,
      projectCanvasViewport
    })
  }, [
    currentWorkbench,
    isRestoringViewportRef,
    reactFlowInstanceRef,
    restoredGraphIdRef,
    projectCanvasViewport,
    terminalZoomRasterCoordinator
  ])
}
