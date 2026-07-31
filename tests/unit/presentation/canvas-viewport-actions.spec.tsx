import { act, renderHook } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { useCanvasViewportActions } from '../../../src/presentation/app-shell/useCanvasViewportActions'

describe('canvas viewport actions', () => {
  it('cancels pending automatic focus before every user viewport command', () => {
    const fitView = vi.fn(async () => true)
    const zoomIn = vi.fn(async () => true)
    const zoomOut = vi.fn(async () => true)
    const onUserAction = vi.fn()
    const { result } = renderHook(() =>
      useCanvasViewportActions({
        onUserAction,
        reactFlowInstanceRef: {
          current: { fitView, zoomIn, zoomOut } as unknown as ReactFlowInstance<
            WorkbenchFlowNode,
            Edge
          >
        }
      })
    )

    act(() => {
      result.current.zoomCanvasIn()
      result.current.zoomCanvasOut()
      result.current.fitCanvas()
    })

    expect(onUserAction).toHaveBeenCalledTimes(3)
    expect(zoomIn).toHaveBeenCalledWith({ duration: 160 })
    expect(zoomOut).toHaveBeenCalledWith({ duration: 160 })
    expect(fitView).toHaveBeenCalledWith({ duration: 180, padding: 0.22 })
  })
})
