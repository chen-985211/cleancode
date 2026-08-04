import { act, renderHook } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { useCanvasSelectionViewport } from '../../../src/presentation/app-shell/useCanvasSelectionViewport'

describe('canvas selection viewport', () => {
  beforeEach(() => {
    stubReducedMotionPreference()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('centers a selected node with the existing readable focus zoom', () => {
    const node = createNode('terminal-1', { x: 240, y: 180 }, { width: 400, height: 300 })
    const { instance, setViewport } = createReactFlowInstance([node], {
      x: -100,
      y: -80,
      zoom: 0.5
    })
    const { result } = renderSelectionViewportHook(instance)

    act(() => {
      result.current.focusSelectedWorkbenchNode(node.id)
    })

    expect(setViewport).toHaveBeenCalledWith({ x: 84, y: 23, zoom: 0.9 }, { duration: 0 })
  })

  it('returns to 35% around the uniquely selected node center', () => {
    const selectedNode = createNode('terminal-1', { x: 100, y: 120 }, { width: 400, height: 300 })
    const distantNode = createNode('terminal-2', { x: 2_000, y: 900 }, { width: 420, height: 306 })
    const { getNodesBounds, instance, setViewport } = createReactFlowInstance([
      selectedNode,
      distantNode
    ])
    const { result } = renderSelectionViewportHook(instance)

    act(() => {
      result.current.returnToGlobalCanvasView(selectedNode.id)
    })

    expect(getNodesBounds).not.toHaveBeenCalled()
    expect(setViewport).toHaveBeenCalledWith({ x: 375, y: 225.5, zoom: 0.35 }, { duration: 0 })
  })

  it('keeps the current viewport center when no unique selection exists', () => {
    const node = createNode('terminal-1', { x: 100, y: 120 }, { width: 400, height: 300 })
    const { instance, setViewport } = createReactFlowInstance([node], {
      x: -100,
      y: -80,
      zoom: 0.5
    })
    const { result } = renderSelectionViewportHook(instance)

    act(() => {
      result.current.returnToGlobalCanvasView(null)
    })

    expect(setViewport).toHaveBeenCalledWith({ x: 74, y: 40, zoom: 0.35 }, { duration: 0 })
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
        zoom: 0.5
      })
      const { result } = renderSelectionViewportHook(instance)

      act(() => {
        result.current.returnToGlobalCanvasView(anchorNodeId)
      })

      expect(setViewport).toHaveBeenCalledWith({ x: 74, y: 40, zoom: 0.35 }, { duration: 0 })
    }
  )

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
  measured: { readonly width: number; readonly height: number }
): WorkbenchFlowNode {
  return {
    data: {},
    id,
    measured,
    position,
    type: 'terminal'
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
