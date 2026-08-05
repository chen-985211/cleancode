import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, type MutableRefObject } from 'react'

import { minimumCanvasZoom } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { resolveWorkbenchNodeCenter, type CanvasSize } from './applicationShortcutNavigation'
import type { WorkbenchFlowNode } from './types'
import {
  resolveWorkbenchNodeFocusZoom,
  resolveWorkbenchNodeSize
} from './workbenchNodeFocusViewport'
import { transitionWorkbenchViewport } from './workbenchViewportMotion'

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
  const focusSelectedWorkbenchNode = useCallback(
    (nodeId: string): void => {
      onUserAction()
      const instance = reactFlowInstanceRef.current
      const node = instance?.getNode(nodeId)
      if (!instance || !node || node.hidden) return

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
        .filter((node) => !node.hidden && node.data.objectMotion?.kind !== 'group-collapse')
      if (stableVisibleNodes.length === 0) return

      const anchorNode = anchorNodeId ? instance.getNode(anchorNodeId) : undefined
      const center =
        anchorNode && !anchorNode.hidden && anchorNode.data.objectMotion?.kind !== 'group-collapse'
          ? resolveWorkbenchNodeCenter(anchorNode)
          : resolveCurrentViewportCenter(instance.getViewport(), canvasSizeRef.current)
      void transitionWorkbenchViewport(instance, {
        center,
        intent: {
          canvasSize: canvasSizeRef.current,
          type: 'adaptive-focus'
        },
        type: 'center',
        zoom: minimumCanvasZoom
      })
    },
    [canvasSizeRef, onUserAction, reactFlowInstanceRef]
  )

  return { focusSelectedWorkbenchNode, returnToGlobalCanvasView }
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
