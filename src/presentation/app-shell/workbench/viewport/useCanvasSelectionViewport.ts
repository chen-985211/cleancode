import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, useRef, type MutableRefObject } from 'react'

import {
  resolveWorkbenchNodeCenter,
  type CanvasSize
} from '../../app-features/shortcuts/applicationShortcutNavigation'
import type { WorkbenchFlowNode } from '../../types/workbenchFlowNode'
import {
  resolveWorkbenchNodeFocusZoom,
  resolveWorkbenchNodeSize
} from './workbenchNodeFocusViewport'
import {
  readWorkbenchViewportPresentation,
  transitionWorkbenchViewport
} from './workbenchViewportMotion'
import { isWorkbenchNodePresentationHidden } from '../../projections/workbenchNodeVisibility'

const globalCanvasViewZoom = 0.5

interface UseCanvasSelectionViewportInput {
  readonly canvasSizeRef: MutableRefObject<CanvasSize>
  readonly onUserAction: () => void
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
}

export function useCanvasSelectionViewport({
  canvasSizeRef,
  onUserAction,
  reactFlowInstanceRef
}: UseCanvasSelectionViewportInput) {
  const overviewRequestRef = useRef<OverviewRequest | null>(null)

  const focusSelectedWorkbenchNode = useCallback(
    (nodeId: string): void => {
      onUserAction()
      overviewRequestRef.current = null
      const instance = reactFlowInstanceRef.current
      const node = instance?.getNode(nodeId)
      if (!instance || !node || isWorkbenchNodePresentationHidden(node)) return

      const viewport = instance.getViewport()
      const zoom = resolveWorkbenchNodeFocusZoom({
        canvasSize: canvasSizeRef.current,
        currentZoom: viewport.zoom,
        nodeSize: resolveWorkbenchNodeSize(node)
      })

      void transitionWorkbenchViewport(instance, {
        center: resolveWorkbenchNodeCenter(node),
        intent: {
          canvasSize: canvasSizeRef.current,
          type: 'adaptive-focus'
        },
        type: 'center',
        zoom
      })
    },
    [canvasSizeRef, onUserAction, reactFlowInstanceRef]
  )

  const returnToGlobalCanvasView = useCallback(
    (anchorNodeId: string | null): void => {
      onUserAction()
      const instance = reactFlowInstanceRef.current
      if (!instance) return

      const stableVisibleNodes = instance
        .getNodes()
        .filter(
          (node) =>
            !isWorkbenchNodePresentationHidden(node) &&
            node.data.objectMotion?.kind !== 'group-collapse'
        )
      if (stableVisibleNodes.length === 0) return

      const activeOverviewRequest = overviewRequestRef.current
      if (
        activeOverviewRequest &&
        (anchorNodeId === null || activeOverviewRequest.anchorNodeId === anchorNodeId)
      ) {
        return
      }

      const anchorNode = anchorNodeId ? instance.getNode(anchorNodeId) : undefined
      const presentation = readWorkbenchViewportPresentation(instance)
      const center =
        anchorNode &&
        !isWorkbenchNodePresentationHidden(anchorNode) &&
        anchorNode.data.objectMotion?.kind !== 'group-collapse'
          ? resolveWorkbenchNodeCenter(anchorNode)
          : resolveCurrentViewportCenter(presentation, canvasSizeRef.current)
      if (isGlobalCanvasViewPresented(presentation, center, canvasSizeRef.current)) return

      const request = transitionWorkbenchViewport(instance, {
        center,
        intent: {
          canvasSize: canvasSizeRef.current,
          type: 'adaptive-focus'
        },
        type: 'center',
        zoom: globalCanvasViewZoom
      })
      const overviewRequest = { anchorNodeId }
      overviewRequestRef.current = overviewRequest
      void request.then(
        () => clearOverviewRequest(overviewRequestRef, overviewRequest),
        () => clearOverviewRequest(overviewRequestRef, overviewRequest)
      )
    },
    [canvasSizeRef, onUserAction, reactFlowInstanceRef]
  )

  return { focusSelectedWorkbenchNode, returnToGlobalCanvasView }
}

interface OverviewRequest {
  readonly anchorNodeId: string | null
}

function clearOverviewRequest(
  requestRef: MutableRefObject<OverviewRequest | null>,
  request: OverviewRequest
): void {
  if (requestRef.current === request) requestRef.current = null
}

function resolveCurrentViewportCenter(
  viewport: { readonly x: number; readonly y: number; readonly zoom: number },
  canvasSize: CanvasSize
): { readonly x: number; readonly y: number } {
  const width = canvasSize.width > 0 ? canvasSize.width : 960
  const height = canvasSize.height > 0 ? canvasSize.height : 640
  const zoom = viewport.zoom > 0 ? viewport.zoom : 1

  return {
    x: (width / 2 - viewport.x) / zoom,
    y: (height / 2 - viewport.y) / zoom
  }
}

function isGlobalCanvasViewPresented(
  viewport: { readonly x: number; readonly y: number; readonly zoom: number },
  center: { readonly x: number; readonly y: number },
  canvasSize: CanvasSize
): boolean {
  const width = canvasSize.width > 0 ? canvasSize.width : 960
  const height = canvasSize.height > 0 ? canvasSize.height : 640
  const targetX = width / 2 - center.x * globalCanvasViewZoom
  const targetY = height / 2 - center.y * globalCanvasViewZoom

  return (
    Math.abs(viewport.zoom - globalCanvasViewZoom) < 0.000_1 &&
    Math.abs(viewport.x - targetX) < 0.1 &&
    Math.abs(viewport.y - targetY) < 0.1
  )
}
