import { act, renderHook } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'
import type * as WorkbenchDirectZoomModule from '../../../src/presentation/app-shell/workbench/viewport/workbenchDirectZoom'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { useCanvasViewportActions } from '../../../src/presentation/app-shell/workbench/viewport/useCanvasViewportActions'

const directZoomSpies = vi.hoisted(() => ({ cancel: vi.fn() }))

vi.mock(
  '../../../src/presentation/app-shell/workbench/viewport/workbenchDirectZoom',
  async (importOriginal) => ({
    ...(await importOriginal<typeof WorkbenchDirectZoomModule>()),
    cancelWorkbenchDirectZoom: directZoomSpies.cancel
  })
)

describe('canvas viewport actions', () => {
  beforeEach(() => {
    directZoomSpies.cancel.mockClear()
    stubReducedMotionPreference()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('cancels pending automatic focus before every user viewport command', () => {
    const { instance, setViewport } = createReactFlowInstance()
    const onUserAction = vi.fn()
    const { result } = renderHook(() =>
      useCanvasViewportActions({
        onUserAction,
        reactFlowInstanceRef: { current: instance }
      })
    )

    act(() => {
      result.current.zoomCanvasIn()
      result.current.zoomCanvasOut()
      result.current.fitCanvas()
    })

    expect(onUserAction).toHaveBeenCalledTimes(3)
    expect(directZoomSpies.cancel).toHaveBeenCalledTimes(3)
    expect(setViewport).toHaveBeenCalledTimes(3)
  })

  it('keeps viewport controls functional without spatial motion when reduced motion is preferred', () => {
    const { instance, setViewport } = createReactFlowInstance()
    const { result } = renderHook(() =>
      useCanvasViewportActions({
        onUserAction: vi.fn(),
        reactFlowInstanceRef: { current: instance }
      })
    )

    act(() => {
      result.current.zoomCanvasIn()
      result.current.zoomCanvasOut()
      result.current.fitCanvas()
    })

    expect(setViewport).toHaveBeenNthCalledWith(1, { x: -144, y: -96, zoom: 1.3 }, { duration: 0 })
    expect(setViewport).toHaveBeenNthCalledWith(2, { x: 0, y: 0, zoom: 1 }, { duration: 0 })
    expect(setViewport).toHaveBeenNthCalledWith(3, expect.any(Object), { duration: 0 })
  })
})

function createReactFlowInstance(): {
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly setViewport: ReturnType<typeof vi.fn>
} {
  let viewport = { x: 0, y: 0, zoom: 1 }
  const nodes = [
    { id: 'terminal-1', position: { x: 0, y: 0 }, type: 'terminal' } as WorkbenchFlowNode
  ]
  const setViewport = vi.fn(async (nextViewport) => {
    viewport = nextViewport
    return true
  })

  return {
    instance: {
      getNodes: () => nodes,
      getNodesBounds: () => ({ height: 100, width: 120, x: 0, y: 0 }),
      getViewport: () => viewport,
      setViewport
    } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>,
    setViewport
  }
}

function stubReducedMotionPreference(): void {
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
}
