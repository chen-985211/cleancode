import { act, renderHook } from '@testing-library/react'
import { useWorkflowCanvasDragging } from '../../../src/presentation/app-shell/workbench/useWorkflowCanvasDragging'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbench/nodes/workbenchNodeStore'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'

describe('workflow canvas dragging', () => {
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
      { x: 268, y: 480 },
      { x: 768, y: 530 }
    ])
    expect(calls.commit).not.toHaveBeenCalled()
    act(() => result.current.commit(event(320, 500, canvas)))
    expect(calls.commit).toHaveBeenCalledOnce()
    expect(calls.commit.mock.calls[0]?.[1]).toMatchObject({ id: 'a', position: { x: 288, y: 480 } })
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

function setup() {
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
  const calls = { start: vi.fn(), preview: vi.fn(), commit: vi.fn(), cancel: vi.fn() }
  const instanceRef = { current: { screenToFlowPosition: (point: unknown) => point } }
  const { result } = renderHook(() =>
    useWorkflowCanvasDragging({
      instanceRef: instanceRef as never,
      nodeStore: store,
      onStart: calls.start,
      onPreview: calls.preview,
      onCommit: calls.commit,
      onCancel: calls.cancel
    })
  )
  const label = document.createElement('div')
  label.dataset.canvasDragTarget = JSON.stringify({
    type: 'workflow',
    terminalBlockIds: ['a', 'b']
  })
  label.dataset.canvasDragScope = 'workflow'
  const canvas = document.createElement('div')
  canvas.className = 'react-flow'
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
  return { result, store, calls, event, canvas, label }
}
