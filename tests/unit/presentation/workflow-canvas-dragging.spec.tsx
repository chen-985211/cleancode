import { act, renderHook } from '@testing-library/react'
import { useWorkflowCanvasDragging } from '../../../src/presentation/app-shell/workbench/useWorkflowCanvasDragging'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbench/nodes/workbenchNodeStore'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'

describe('workflow canvas dragging', () => {
  it.each(['shortcut', 'unmarked'])(
    'does not claim a workflow gesture from a %s outside the canvas drag handle',
    (origin) => {
      const { result, store, calls, event, canvas, label } = setup()
      delete label.dataset.canvasDragOrigin
      if (origin === 'shortcut') label.dataset.quickExecutionSlot = '1'
      const before = store.getNodes()
      const down = event(100, 700)
      expect(result.current.begin(down)).toBe(false)
      act(() => result.current.preview(event(300, 500, canvas)))
      act(() => result.current.commit(event(300, 500, canvas)))
      expect(store.getNodes()).toEqual(before)
      expect(calls.start).not.toHaveBeenCalled()
      expect(calls.commit).not.toHaveBeenCalled()
    }
  )
  it.each([0.5, 1])(
    'pans at the canvas edge while holding the pointer and stops on cancel, zoom=%s',
    async (zoom) => {
      const frames = new Map<number, FrameRequestCallback>()
      let sequence = 0
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        frames.set(++sequence, callback)
        return sequence
      })
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
        frames.delete(id)
      })
      const { result, store, event, canvas, label, viewport, calls } = setup(zoom)
      label.dataset.canvasDragOrigin = 'canvas'
      act(() => result.current.begin(event(100, 80)))
      act(() => result.current.preview(event(795, 300, canvas)))
      const before = store.getNodes().map((node) => node.position)
      await act(async () => {
        const entry = frames.entries().next().value
        expect(entry).toBeDefined()
        frames.delete(entry![0])
        entry![1](performance.now())
      })
      expect(viewport.x).toBeLessThan(0)
      const dx = -viewport.x / zoom
      store.getNodes().forEach((node, index) => {
        expect(node.position.x - before[index]!.x).toBeCloseTo(dx)
        expect(node.position.y).toBe(before[index]!.y)
      })
      act(() => result.current.cancel())
      expect(frames.size).toBe(0)
      expect(calls.viewport).toHaveBeenCalledExactlyOnceWith(viewport)
      vi.restoreAllMocks()
    }
  )
  it('uses projection templates for a restored collapsed workflow and removes previews on cancel', () => {
    const { result, store, calls, event, canvas } = setup()
    store.setNodeTemplates(store.getNodes())
    store.setNodes([])
    act(() => result.current.begin(event(100, 700)))
    expect(store.getNodes()).toEqual([])
    act(() => result.current.preview(event(300, 500, canvas)))
    expect(store.getNodes()).toHaveLength(2)
    expect(store.getNodes().every((node) => node.data.isObjectDragPreview)).toBe(true)
    act(() => result.current.cancel())
    expect(store.getNodes()).toEqual([])
    expect(calls.commit).not.toHaveBeenCalled()
  })

  it('preserves a click below the drag threshold and suppresses only the dragged handle click', () => {
    const { result, calls, event, canvas, label } = setup()
    act(() => result.current.begin(event(100, 700)))
    act(() => result.current.preview(event(102, 702, canvas)))
    expect(result.current.commit(event(102, 702, canvas))).toBe(false)
    expect(calls.start).not.toHaveBeenCalled()
    act(() => result.current.begin(event(100, 700)))
    act(() => result.current.preview(event(300, 500, canvas)))
    act(() => result.current.commit(event(300, 500, canvas)))
    expect(
      result.current.suppressClick({
        target: label,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as never)
    ).toBe(true)
    act(() => result.current.begin(event(100, 700)))
    act(() => result.current.preview(event(300, 500, canvas)))
    act(() => result.current.cancel())
    const otherButton = document.createElement('button')
    expect(result.current.suppressClick({ target: otherButton } as never)).toBe(false)
  })
  it('keeps the original grab offset when a workflow is dragged from its canvas handle', () => {
    const { result, store, event, canvas, label } = setup()
    label.dataset.canvasDragOrigin = 'canvas'
    act(() => result.current.begin(event(100, 80)))
    act(() => result.current.preview(event(160, 120, canvas)))
    expect(store.getNodes().map((node) => node.position)).toEqual([
      { x: 70, y: 60 },
      { x: 570, y: 110 }
    ])
  })

  it('continues a pointer drag when projection replaces the workflow label', () => {
    const { result, calls, event, canvas, label } = setup()
    document.body.append(canvas)
    canvas.append(label)
    let capture: Element | null = null
    canvas.setPointerCapture = () => {
      capture = canvas
    }
    label.setPointerCapture = () => {
      capture = label
    }
    act(() => result.current.begin(event(100, 80)))
    act(() => result.current.preview(event(160, 120, canvas)))
    // Chromium drops capture when its target is removed or reparented by projection.
    act(() => {
      label.remove()
      if (capture === label) window.dispatchEvent(new Event('lostpointercapture'))
    })
    act(() => result.current.preview(event(200, 160, canvas)))
    act(() => result.current.commit(event(200, 160, canvas)))
    expect(calls.cancel).not.toHaveBeenCalled()
    expect(calls.commit).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      expect.objectContaining({
        id: 'a',
        position: { x: 110, y: 100 }
      })
    )
    expect(
      result.current.suppressClick({
        target: canvas,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn()
      } as never)
    ).toBe(true)
    canvas.remove()
  })

  it('supports keyboard grabbing, moving and placing the same complete workflow', () => {
    const { result, store, calls, canvas, label } = setup()
    label.dataset.canvasDragOrigin = 'canvas'
    canvas.append(label)
    const key = (value: string) =>
      ({ key: value, target: label, preventDefault: vi.fn(), stopPropagation: vi.fn() }) as never
    act(() => result.current.keyDown(key(' ')))
    expect(label).toHaveAttribute('aria-pressed', 'true')
    act(() => result.current.keyDown(key('ArrowRight')))
    expect(store.getNodes().map((node) => node.position.x)).toEqual([26, 526])
    act(() => result.current.keyDown(key('Enter')))
    expect(calls.commit).toHaveBeenCalledOnce()
    expect(label).not.toHaveAttribute('aria-pressed')
  })

  it('previews every member with one delta and commits one representative only on drop', () => {
    const { result, store, calls, event, canvas } = setup()
    act(() => result.current.begin(event(100, 700)))
    act(() => result.current.preview(event(300, 500, canvas)))
    expect(store.getNodes().map((node) => node.position)).toEqual([
      { x: 210, y: -180 },
      { x: 710, y: -130 }
    ])
    expect(calls.commit).not.toHaveBeenCalled()
    act(() => result.current.commit(event(320, 500, canvas)))
    expect(calls.commit).toHaveBeenCalledOnce()
    expect(calls.commit.mock.calls[0]?.[1]).toMatchObject({
      id: 'a',
      position: { x: 230, y: -180 }
    })
    expect(calls.start.mock.calls[0]?.[2]).toEqual(['a', 'b'])
  })

  it.each(['Escape', 'cancel'] as const)(
    'restores all member positions on %s and never commits',
    (reason) => {
      const { result, store, calls, event, canvas } = setup()
      act(() => result.current.begin(event(100, 700)))
      act(() => result.current.preview(event(300, 500, canvas)))
      act(() => {
        if (reason === 'Escape')
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        else result.current.cancel()
      })
      act(() => result.current.commit(event(320, 500, canvas)))
      expect(store.getNodes().map((node) => node.position)).toEqual([
        { x: 10, y: 20 },
        { x: 510, y: 70 }
      ])
      expect(calls.commit).not.toHaveBeenCalled()
      expect(calls.cancel).toHaveBeenCalledExactlyOnceWith('a')
    }
  )
})

function setup(zoom = 1) {
  const store = createWorkbenchNodeStore(
    ['a', 'b'].map(
      (id, i) =>
        ({
          id,
          type: 'terminal',
          position: { x: 10 + i * 500, y: 20 + i * 50 },
          data: {}
        }) as WorkbenchFlowNode
    )
  )
  const calls = {
    start: vi.fn(),
    preview: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
    viewport: vi.fn()
  }
  const viewport = { x: 0, y: 0, zoom }
  const canvas = document.createElement('div')
  canvas.className = 'react-flow'
  canvas.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect
  const instanceRef = {
    current: {
      screenToFlowPosition: (point: { x: number; y: number }) => ({
        x: (point.x - viewport.x) / zoom,
        y: (point.y - viewport.y) / zoom
      }),
      getViewport: () => viewport,
      setViewport: async (next: typeof viewport) => {
        Object.assign(viewport, next)
        return true
      }
    }
  }
  const { result } = renderHook(() =>
    useWorkflowCanvasDragging({
      instanceRef: instanceRef as never,
      surfaceRef: { current: canvas },
      nodeStore: store,
      onStart: calls.start,
      onPreview: calls.preview,
      onCommit: calls.commit,
      onViewportChange: calls.viewport,
      onCancel: calls.cancel
    })
  )
  const label = document.createElement('div')
  label.dataset.canvasDragTarget = JSON.stringify({
    type: 'workflow',
    terminalBlockIds: ['a', 'b']
  })
  label.dataset.canvasDragScope = 'workflow'
  label.dataset.canvasDragOrigin = 'canvas'
  const event = (clientX: number, clientY: number, target: Element = label) =>
    ({
      button: 0,
      pointerId: 1,
      target,
      clientX,
      clientY,
      nativeEvent: new MouseEvent('drag'),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { setData: vi.fn() }
    }) as never
  return { result, store, calls, event, canvas, label, viewport }
}
