import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, type MutableRefObject } from 'react'

import type { WorkbenchFlowNode } from './types'

export function useCanvasViewportActions({
  onUserAction,
  reactFlowInstanceRef
}: {
  readonly onUserAction: () => void
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
}) {
  const zoomCanvasIn = useCallback((): void => {
    onUserAction()
    void reactFlowInstanceRef.current?.zoomIn({ duration: 160 })
  }, [onUserAction, reactFlowInstanceRef])
  const zoomCanvasOut = useCallback((): void => {
    onUserAction()
    void reactFlowInstanceRef.current?.zoomOut({ duration: 160 })
  }, [onUserAction, reactFlowInstanceRef])
  const fitCanvas = useCallback((): void => {
    onUserAction()
    void reactFlowInstanceRef.current?.fitView({ padding: 0.22, duration: 180 })
  }, [onUserAction, reactFlowInstanceRef])

  return { fitCanvas, zoomCanvasIn, zoomCanvasOut }
}
