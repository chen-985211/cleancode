import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useCallback, type MutableRefObject } from 'react'

import type { WorkbenchFlowNode } from './types'
import { transitionWorkbenchViewport } from './workbenchViewportMotion'

export function useCanvasViewportActions({
  onUserAction,
  reactFlowInstanceRef
}: {
  readonly onUserAction: () => void
  readonly reactFlowInstanceRef: MutableRefObject<ReactFlowInstance<WorkbenchFlowNode, Edge> | null>
}) {
  const zoomCanvasIn = useCallback((): void => {
    onUserAction()
    const instance = reactFlowInstanceRef.current
    if (instance)
      void transitionWorkbenchViewport(instance, { intent: { type: 'quick' }, type: 'zoom-in' })
  }, [onUserAction, reactFlowInstanceRef])
  const zoomCanvasOut = useCallback((): void => {
    onUserAction()
    const instance = reactFlowInstanceRef.current
    if (instance)
      void transitionWorkbenchViewport(instance, { intent: { type: 'quick' }, type: 'zoom-out' })
  }, [onUserAction, reactFlowInstanceRef])
  const fitCanvas = useCallback((): void => {
    onUserAction()
    const instance = reactFlowInstanceRef.current
    if (instance) {
      void transitionWorkbenchViewport(instance, {
        intent: { type: 'quick' },
        padding: 0.22,
        type: 'fit-view'
      })
    }
  }, [onUserAction, reactFlowInstanceRef])

  return { fitCanvas, zoomCanvasIn, zoomCanvasOut }
}
