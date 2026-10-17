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
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it.each(['terminal', 'agentConsole'] as const)(
    'activates the selected %s input only after centering completes',
    async (type) => {
      vi.useFakeTimers()
      const { node, input } = renderSelectedInput(type)
      const { instance, setViewport } = createReactFlowInstance([node])
      let complete!: (completed: boolean) => void
      setViewport.mockImplementationOnce(
        () => new Promise<boolean>((resolve) => (complete = resolve))
      )
      const { result } = renderSelectionViewportHook(instance)

      act(() => result.current.focusSelectedWorkbenchNode(node.id))
      await act(() => vi.advanceTimersByTimeAsync(200))
      expect(input).not.toHaveFocus()

      await act(async () => {
        complete(true)
        await vi.advanceTimersByTimeAsync(200)
      })
      expect(input).toHaveFocus()
    }
  )

  it.each([
    'pointer',
    'focus',
    'keyboard',
    'wheel',
    'blur',
    'deselection',
    'workspace',
    'unmount'
  ] as const)(
    'does not activate an outdated selected input after %s changes the user intent',
    async (interruption) => {
      vi.useFakeTimers()
      const { node, input } = renderSelectedInput('terminal')
      const nodes = [node]
      const { instance } = createReactFlowInstance(nodes)
      const { result, unmount } = renderSelectionViewportHook(instance)
      act(() => result.current.focusSelectedWorkbenchNode(node.id))

      act(() => {
        if (interruption === 'pointer') document.dispatchEvent(new Event('pointerdown'))
        if (interruption === 'keyboard') document.dispatchEvent(new Event('keydown'))
        if (interruption === 'wheel') document.dispatchEvent(new Event('wheel'))
        if (interruption === 'blur') window.dispatchEvent(new Event('blur'))
        if (interruption === 'focus') {
          const button = document.createElement('button')
          document.body.append(button)
          button.focus()
        }
        if (interruption === 'deselection') node.selected = false
        if (interruption === 'workspace') {
          nodes[0] = {
            ...node,
            data: { ...node.data, identity: { ...node.data.identity, workspaceId: 'other' } }
          } as WorkbenchFlowNode
        }
        if (interruption === 'unmount') unmount()
      })
      await act(() => vi.advanceTimersByTimeAsync(2_500))
      expect(input).not.toHaveFocus()
    }
  )

  it('waits for the exact attached terminal session before activating its input', async () => {
    vi.useFakeTimers()
    const { node, input, viewport } = renderSelectedInput('terminal')
    viewport.setAttribute('data-terminal-attached-session-id', 'old-session')
    const { instance } = createReactFlowInstance([node])
    const { result } = renderSelectionViewportHook(instance)

    act(() => result.current.focusSelectedWorkbenchNode(node.id))
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(input).not.toHaveFocus()

    viewport.setAttribute('data-terminal-attached-session-id', 'session-1')
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(input).toHaveFocus()
  })

  it('reactivates an already selected input on another title click without continuously stealing focus', async () => {
    vi.useFakeTimers()
    const { node, input } = renderSelectedInput('terminal')
    const { instance } = createReactFlowInstance([node])
    const { result } = renderSelectionViewportHook(instance)
    act(() => result.current.focusSelectedWorkbenchNode(node.id))
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(input).toHaveFocus()

    const button = document.createElement('button')
    document.body.append(button)
    button.focus()
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(button).toHaveFocus()

    act(() => result.current.focusSelectedWorkbenchNode(node.id))
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(input).toHaveFocus()
  })

  it('activates only the latest selected node when a second title interrupts the first transition', async () => {
    vi.useFakeTimers()
    const terminal = renderSelectedInput('terminal')
    const agent = renderSelectedInput('agentConsole')
    agent.node.selected = false
    const { instance } = createReactFlowInstance([terminal.node, agent.node])
    const { result } = renderSelectionViewportHook(instance)
    act(() => {
      result.current.focusSelectedWorkbenchNode(terminal.node.id)
      terminal.node.selected = false
      agent.node.selected = true
      result.current.focusSelectedWorkbenchNode(agent.node.id)
    })
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(agent.input).toHaveFocus()
    expect(terminal.input).not.toHaveFocus()
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

function renderSelectedInput(type: 'terminal' | 'agentConsole') {
  const node = {
    ...createNode(
      type === 'terminal' ? 'terminal-1' : 'agent:agent-1',
      { x: 240, y: 180 },
      { width: 400, height: 300 },
      type
    ),
    selected: true,
    data: {
      identity: {
        projectId: 'project-1',
        workspaceId: 'main',
        objectKind: type === 'terminal' ? 'terminal' : 'agent',
        objectId: type === 'terminal' ? 'terminal-1' : 'agent-1'
      }
    }
  } as WorkbenchFlowNode
  const container = document.createElement('section')
  container.setAttribute(
    type === 'terminal' ? 'data-terminal-block-id' : 'data-agent-console-node',
    type === 'terminal' ? node.id : 'agent-1'
  )
  const viewport = document.createElement('div')
  viewport.className = type === 'terminal' ? 'terminal-viewport' : 'agent-terminal-viewport'
  viewport.setAttribute('data-terminal-attached-session-id', 'session-1')
  viewport.setAttribute('data-agent-terminal-view-session-id', 'session-1')
  const input = document.createElement('textarea')
  input.className = 'xterm-helper-textarea'
  viewport.append(input)
  const tail = document.createElement('pre')
  tail.setAttribute('data-terminal-output-tail', 'true')
  tail.setAttribute('data-terminal-session-id', 'session-1')
  container.append(viewport, tail)
  document.body.append(container)
  return { node, input, viewport }
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
