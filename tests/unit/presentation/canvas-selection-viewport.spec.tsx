import { act, renderHook } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { useCanvasSelectionViewport } from '../../../src/presentation/app-shell/workbench/viewport/useCanvasSelectionViewport'

describe('canvas selection viewport', () => {
  beforeEach(() => {
    stubReducedMotionPreference()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(['terminal', 'terminalGroup', 'agentConsole'] as const)(
    'centers a selected %s at 100%',
    (type) => {
      const node = createNode(
        'selected-node',
        { x: 240, y: 180 },
        { width: 400, height: 300 },
        type
      )
      const { instance, setViewport } = createReactFlowInstance([node], {
        x: -100,
        y: -80,
        zoom: 0.5
      })
      const { result } = renderSelectionViewportHook(instance)

      act(() => {
        result.current.focusSelectedWorkbenchNode(node.id)
      })

      expect(setViewport).toHaveBeenCalledWith({ x: 40, y: -10, zoom: 1 }, { duration: 0 })
    }
  )

  it.each(['terminal', 'terminalGroup', 'agentConsole'] as const)(
    'returns to 50% around the uniquely selected %s center',
    (type) => {
      const selectedNode = createNode(
        'selected-node',
        { x: 100, y: 120 },
        { width: 400, height: 300 },
        type
      )
      const distantNode = createNode(
        'terminal-2',
        { x: 2_000, y: 900 },
        { width: 420, height: 306 }
      )
      const { getNodesBounds, instance, setViewport } = createReactFlowInstance([
        selectedNode,
        distantNode
      ])
      const { result } = renderSelectionViewportHook(instance)

      act(() => {
        result.current.returnToGlobalCanvasView(selectedNode.id)
      })

      expect(getNodesBounds).not.toHaveBeenCalled()
      expect(setViewport).toHaveBeenCalledWith({ x: 330, y: 185, zoom: 0.5 }, { duration: 0 })
    }
  )

  it('keeps the current viewport center when no unique selection exists', () => {
    const node = createNode('terminal-1', { x: 100, y: 120 }, { width: 400, height: 300 })
    const { instance, setViewport } = createReactFlowInstance([node], {
      x: -100,
      y: -80,
      zoom: 1
    })
    const { result } = renderSelectionViewportHook(instance)

    act(() => {
      result.current.returnToGlobalCanvasView(null)
    })

    expect(setViewport).toHaveBeenCalledWith({ x: 190, y: 120, zoom: 0.5 }, { duration: 0 })
  })

  it('coalesces repeated overview requests while the first request is still in flight', () => {
    const node = createNode('terminal-1', { x: 100, y: 120 }, { width: 400, height: 300 })
    const { instance, setViewport } = createReactFlowInstance([node], {
      x: -100,
      y: -80,
      zoom: 1
    })
    const { result } = renderSelectionViewportHook(instance)

    act(() => {
      result.current.returnToGlobalCanvasView(null)
      result.current.returnToGlobalCanvasView(null)
      result.current.returnToGlobalCanvasView(null)
    })

    expect(setViewport).toHaveBeenCalledOnce()
  })

  it('does not restart overview motion after the viewport has already settled at 50%', async () => {
    const node = createNode('terminal-1', { x: 100, y: 120 }, { width: 400, height: 300 })
    const { instance, setViewport } = createReactFlowInstance([node], {
      x: -100,
      y: -80,
      zoom: 1
    })
    const { result } = renderSelectionViewportHook(instance)

    await act(async () => {
      result.current.returnToGlobalCanvasView(null)
      await Promise.resolve()
    })
    act(() => result.current.returnToGlobalCanvasView(null))

    expect(setViewport).toHaveBeenCalledOnce()
  })

  it.each(['missing-terminal', 'hidden-terminal'])(
    'falls back to the current viewport center when anchor %s is unavailable',
    (anchorNodeId) => {
      const visibleNode = createNode('terminal-1', { x: 100, y: 120 }, { width: 400, height: 300 })
      const hiddenNode = createNode(
        'hidden-terminal',
        { x: 2_000, y: 900 },
        { width: 400, height: 300 }
      )
      hiddenNode.hidden = true
      const { instance, setViewport } = createReactFlowInstance([visibleNode, hiddenNode], {
        x: -100,
        y: -80,
        zoom: 1
      })
      const { result } = renderSelectionViewportHook(instance)

      act(() => {
        result.current.returnToGlobalCanvasView(anchorNodeId)
      })

      expect(setViewport).toHaveBeenCalledWith({ x: 190, y: 120, zoom: 0.5 }, { duration: 0 })
    }
  )

  it('returns from the manual minimum zoom to 50% around the current viewport center', () => {
    const node = createNode('terminal-1', { x: 100, y: 120 }, { width: 400, height: 300 })
    const { instance, setViewport } = createReactFlowInstance([node], {
      x: 340,
      y: 250,
      zoom: 0.35
    })
    const { result } = renderSelectionViewportHook(instance)

    act(() => result.current.returnToGlobalCanvasView(null))

    expect(setViewport).toHaveBeenCalledWith({ x: 280, y: 220, zoom: 0.5 }, { duration: 0 })
  })

  it('does not move an empty canvas', () => {
    const { instance, setViewport } = createReactFlowInstance([])
    const { result } = renderSelectionViewportHook(instance)

    act(() => {
      result.current.returnToGlobalCanvasView(null)
    })

    expect(setViewport).not.toHaveBeenCalled()
  })

  it('cancels pending automatic focus before selection viewport commands', () => {
    const node = createNode('terminal-1', { x: 0, y: 0 }, { width: 400, height: 300 })
    const { instance } = createReactFlowInstance([node])
    const onUserAction = vi.fn()
    const { result } = renderSelectionViewportHook(instance, onUserAction)

    act(() => {
      result.current.focusSelectedWorkbenchNode(node.id)
      result.current.returnToGlobalCanvasView(node.id)
    })

    expect(onUserAction).toHaveBeenCalledTimes(2)
  })
})

function renderSelectionViewportHook(
  instance: ReactFlowInstance<WorkbenchFlowNode, Edge>,
  onUserAction = vi.fn()
) {
  return renderHook(() =>
    useCanvasSelectionViewport({
      canvasSizeRef: { current: { width: 960, height: 640 } },
      onUserAction,
      reactFlowInstanceRef: { current: instance }
    })
  )
}

function createReactFlowInstance(
  nodes: WorkbenchFlowNode[],
  initialViewport = { x: 0, y: 0, zoom: 1 }
): {
  readonly getNodesBounds: ReturnType<typeof vi.fn>
  readonly instance: ReactFlowInstance<WorkbenchFlowNode, Edge>
  readonly setViewport: ReturnType<typeof vi.fn>
} {
  let viewport = initialViewport
  const getNodesBounds = vi.fn(() => ({ height: 300, width: 400, x: 0, y: 0 }))
  const setViewport = vi.fn(async (nextViewport) => {
    viewport = nextViewport
    return true
  })

  return {
    getNodesBounds,
    instance: {
      getNode: (nodeId: string) => nodes.find((node) => node.id === nodeId),
      getNodes: () => nodes,
      getNodesBounds,
      getViewport: () => viewport,
      setViewport
    } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>,
    setViewport
  }
}

function createNode(
  id: string,
  position: { readonly x: number; readonly y: number },
  measured: { readonly width: number; readonly height: number },
  type: WorkbenchFlowNode['type'] = 'terminal'
): WorkbenchFlowNode {
  return {
    data: {},
    id,
    measured,
    position,
    type
  } as unknown as WorkbenchFlowNode
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
