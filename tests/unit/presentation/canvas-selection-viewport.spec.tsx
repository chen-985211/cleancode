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

  it('returns to the stable visible content center at exactly the minimum 35% zoom', () => {
    const visibleNode = createNode('terminal-1', { x: 100, y: 120 }, { width: 400, height: 300 })
    const expandingNode = createNode('terminal-2', { x: 900, y: 500 }, { width: 420, height: 306 })
    Object.assign(expandingNode.data, {
      objectMotion: {
        id: 'expand:terminal-2',
        kind: 'group-expand',
        offset: { x: 20, y: 20 }
      }
    })
    const hiddenNode = createNode(
      'hidden-terminal',
      { x: 2_000, y: 900 },
      { width: 400, height: 300 }
    )
    hiddenNode.hidden = true
    const exitingNode = createNode(
      'exiting-terminal',
      { x: -1_000, y: -800 },
      { width: 400, height: 300 }
    )
    Object.assign(exitingNode.data, {
      objectMotion: {
        id: 'collapse:exiting-terminal',
        kind: 'group-collapse',
        offset: { x: -20, y: -20 }
      }
    })
    const { getNodesBounds, instance, setViewport } = createReactFlowInstance([
      visibleNode,
      expandingNode,
      hiddenNode,
      exitingNode
    ])
    getNodesBounds.mockReturnValue({ height: 686, width: 1_220, x: 100, y: 120 })
    const { result } = renderSelectionViewportHook(instance)

    act(() => {
      result.current.returnToGlobalCanvasView()
    })

    expect(getNodesBounds).toHaveBeenCalledWith([visibleNode, expandingNode])
    const [globalViewport, transition] = setViewport.mock.calls[0]!
    expect(globalViewport.x).toBeCloseTo(231.5)
    expect(globalViewport.y).toBeCloseTo(157.95)
    expect(globalViewport.zoom).toBe(0.35)
    expect(transition).toEqual({ duration: 0 })
  })

  it('does not move an empty canvas', () => {
    const { instance, setViewport } = createReactFlowInstance([])
    const { result } = renderSelectionViewportHook(instance)

    act(() => {
      result.current.returnToGlobalCanvasView()
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
      result.current.returnToGlobalCanvasView()
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
