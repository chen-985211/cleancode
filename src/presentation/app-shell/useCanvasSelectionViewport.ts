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

  const returnToGlobalCanvasView = useCallback((): void => {
    onUserAction()
    const instance = reactFlowInstanceRef.current
    if (!instance) return

    const stableVisibleNodes = instance
      .getNodes()
      .filter((node) => !node.hidden && node.data.objectMotion?.kind !== 'group-collapse')
    if (stableVisibleNodes.length === 0) return

    const bounds = instance.getNodesBounds(stableVisibleNodes)
    void transitionWorkbenchViewport(instance, {
      center: {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2
      },
      intent: {
        canvasSize: canvasSizeRef.current,
        type: 'adaptive-focus'
      },
      type: 'center',
      zoom: minimumCanvasZoom
    })
  }, [canvasSizeRef, onUserAction, reactFlowInstanceRef])

  return { focusSelectedWorkbenchNode, returnToGlobalCanvasView }
}
