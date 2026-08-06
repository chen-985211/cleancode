import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { subscribeCanvasViewportMotionCompletion } from '../../../src/presentation/app-shell/workbenchCanvasViewport'

const motionSubscriptions = vi.hoisted(() => ({
  directListener: null as ((completion: { readonly viewport: Viewport }) => void) | null,
  programmaticListener: null as
    | ((completion: {
        readonly intent: { readonly type: 'quick' }
        readonly viewport: Viewport
      }) => void)
    | null
}))

vi.mock('../../../src/presentation/app-shell/workbenchDirectZoom', () => ({
  subscribeWorkbenchDirectZoomCompletion: (
    _instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    listener: (completion: { readonly viewport: Viewport }) => void
  ) => {
    motionSubscriptions.directListener = listener
    return vi.fn()
  }
}))

vi.mock('../../../src/presentation/app-shell/workbenchViewportMotion', () => ({
  subscribeWorkbenchViewportMotionCompletion: (
    _instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
    listener: (completion: {
      readonly intent: { readonly type: 'quick' }
      readonly viewport: Viewport
    }) => void
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
    const setCanvasViewport = vi.fn()
    const setViewportZoom = vi.fn()
    const instance = {} as ReactFlowInstance<WorkbenchFlowNode, Edge>

    subscribeCanvasViewportMotionCompletion({
      instance,
      onViewportChangeRef,
      setCanvasViewport,
      setViewportZoom
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
    expect(setCanvasViewport).toHaveBeenCalledTimes(2)
    expect(setViewportZoom).toHaveBeenCalledTimes(2)
  })
})
