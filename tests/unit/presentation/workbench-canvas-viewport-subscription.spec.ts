import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { subscribeCanvasViewportMotionCompletion } from '../../../src/presentation/app-shell/workbench/viewport/workbenchCanvasViewport'
import type { WorkbenchViewportMotionCompletion } from '../../../src/presentation/app-shell/workbench/viewport/workbenchViewportMotion'

const motionSubscriptions = vi.hoisted(() => ({
  directListener: null as ((completion: { readonly viewport: Viewport }) => void) | null,
  programmaticListener: null as ((completion: WorkbenchViewportMotionCompletion) => void) | null
}))

vi.mock('../../../src/presentation/app-shell/workbench/viewport/workbenchDirectZoom', () => ({
  subscribeWorkbenchDirectZoomCompletion: (
    _instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    listener: (completion: { readonly viewport: Viewport }) => void
  ) => {
    motionSubscriptions.directListener = listener
    return vi.fn()
  }
}))

vi.mock('../../../src/presentation/app-shell/workbench/viewport/workbenchViewportMotion', () => ({
  subscribeWorkbenchViewportMotionCompletion: (
    _instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    listener: (completion: WorkbenchViewportMotionCompletion) => void
  ) => {
    motionSubscriptions.programmaticListener = listener
    return vi.fn()
  }
}))

describe('workbench canvas viewport completion subscription', () => {
  it('publishes both motion sources through the latest persistence callback', () => {
    const staleOnViewportChange = vi.fn()
    const currentOnViewportChange = vi.fn()
    const onViewportChangeRef = { current: staleOnViewportChange }
    const projectCanvasViewport = vi.fn()
    const onRasterInteractionEnd = vi.fn()
    const instance = {} as ReactFlowInstance<WorkbenchFlowNode, Edge>

    subscribeCanvasViewportMotionCompletion({
      instance,
      onRasterInteractionEnd,
      onViewportChangeRef,
      projectCanvasViewport
    })
    onViewportChangeRef.current = currentOnViewportChange
    motionSubscriptions.programmaticListener?.({
      intent: { type: 'quick' },
      viewport: { x: -40, y: 20, zoom: 1.2 }
    })
    motionSubscriptions.directListener?.({
      viewport: { x: -80, y: 40, zoom: 1.3 }
    })

    expect(staleOnViewportChange).not.toHaveBeenCalled()
    expect(currentOnViewportChange).toHaveBeenNthCalledWith(1, { x: -40, y: 20, zoom: 1.2 })
    expect(currentOnViewportChange).toHaveBeenNthCalledWith(2, { x: -80, y: 40, zoom: 1.3 })
    expect(projectCanvasViewport).toHaveBeenCalledTimes(2)
    expect(onRasterInteractionEnd).toHaveBeenCalledTimes(2)
    expect(onRasterInteractionEnd).toHaveBeenNthCalledWith(1, 1.2)
    expect(onRasterInteractionEnd).toHaveBeenNthCalledWith(2, 1.3)
  })

  it('ends raster interaction after instant restoration without persisting the viewport again', () => {
    const onRasterInteractionEnd = vi.fn()
    const onViewportChange = vi.fn()
    const projectCanvasViewport = vi.fn()
    subscribeCanvasViewportMotionCompletion({
      instance: {} as ReactFlowInstance<WorkbenchFlowNode, Edge>,
      onRasterInteractionEnd,
      onViewportChangeRef: { current: onViewportChange },
      projectCanvasViewport
    })

    motionSubscriptions.programmaticListener?.({
      intent: { type: 'instant' },
      viewport: { x: 0, y: 0, zoom: 0.35 }
    })

    expect(onRasterInteractionEnd).toHaveBeenCalledExactlyOnceWith(0.35)
    expect(onViewportChange).not.toHaveBeenCalled()
    expect(projectCanvasViewport).not.toHaveBeenCalled()
  })
})
