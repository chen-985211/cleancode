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
    expect(zoomIn).toHaveBeenCalledWith({
      duration: 180,
      ease: expect.any(Function),
      interpolate: 'smooth'
    })
    expect(zoomOut).toHaveBeenCalledWith({
      duration: 180,
      ease: expect.any(Function),
      interpolate: 'smooth'
    })
    expect(fitView).toHaveBeenCalledWith({
      duration: 180,
      ease: expect.any(Function),
      interpolate: 'smooth',
      padding: 0.22
    })
  })

  it('keeps viewport controls functional without spatial motion when reduced motion is preferred', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    )
    const fitView = vi.fn(async () => true)
    const zoomIn = vi.fn(async () => true)
    const zoomOut = vi.fn(async () => true)
    const { result } = renderHook(() =>
      useCanvasViewportActions({
        onUserAction: vi.fn(),
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

    expect(zoomIn).toHaveBeenCalledWith({ duration: 0 })
    expect(zoomOut).toHaveBeenCalledWith({ duration: 0 })
    expect(fitView).toHaveBeenCalledWith({ duration: 0, padding: 0.22 })
  })
})
