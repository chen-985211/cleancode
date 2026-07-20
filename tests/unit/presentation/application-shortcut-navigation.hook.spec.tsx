import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { act, renderHook } from '@testing-library/react'

import { useApplicationShortcutNavigation } from '../../../src/presentation/app-shell/useApplicationShortcutNavigation'
import type {
  WorkbenchFlowNode,
  WorkbenchSnapshot
} from '../../../src/presentation/app-shell/types'

describe('application shortcut navigation hook', () => {
  afterEach(() => vi.restoreAllMocks())

  it('runs one animation frame loop for every active pan direction and cancels it when stopped', () => {
    let viewport = { x: 0, y: 0, zoom: 1 }
    let nextFrameId = 0
    const pendingFrames = new Map<number, FrameRequestCallback>()
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => {
        nextFrameId += 1
        pendingFrames.set(nextFrameId, callback)
        return nextFrameId
      })
    const cancelAnimationFrame = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((frameId) => {
        pendingFrames.delete(frameId)
      })
    vi.spyOn(performance, 'now').mockReturnValue(100)
    const setViewport = vi.fn(async (nextViewport: typeof viewport) => {
      viewport = nextViewport
      return true
    })
    const reactFlowInstanceRef = {
      current: {
        getViewport: () => viewport,
        setViewport
      } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
    }
    const hook = renderHook(() =>
      useApplicationShortcutNavigation({
        currentWorkbench: null,
        onSelectWorkspace:
          vi.fn<(workbench: WorkbenchSnapshot, workspaceName: string) => Promise<void>>(),
        reactFlowInstanceRef,
        revealProjectSidebar: vi.fn(),
        workbenches: []
      })
    )

    act(() => hook.result.current.startPanCanvas('left'))

    expect(setViewport).toHaveBeenLastCalledWith({ x: 11.52, y: 0, zoom: 1 })
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

    act(() => hook.result.current.startPanCanvas('up'))
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)

    const firstFrame = pendingFrames.get(1)
    expect(firstFrame).toBeDefined()
    pendingFrames.delete(1)
    act(() => firstFrame?.(116))

    expect(setViewport).toHaveBeenLastCalledWith({
      x: 11.52 + 11.52 / Math.sqrt(2),
      y: 11.52 / Math.sqrt(2),
      zoom: 1
    })
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2)

    act(() => hook.result.current.stopPanCanvas('left'))
    expect(cancelAnimationFrame).not.toHaveBeenCalled()

    act(() => hook.result.current.stopPanCanvas('up'))
    expect(cancelAnimationFrame).toHaveBeenCalledWith(2)
    expect(pendingFrames.size).toBe(0)

    hook.unmount()
  })

  it('cancels a pending pan frame when the hook unmounts', () => {
    const requestAnimationFrame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 42)
    const cancelAnimationFrame = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => undefined)
    const reactFlowInstanceRef = {
      current: {
        getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
        setViewport: vi.fn(async () => true)
      } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
    }
    const hook = renderHook(() =>
      useApplicationShortcutNavigation({
        currentWorkbench: null,
        onSelectWorkspace: vi.fn(),
        reactFlowInstanceRef,
        revealProjectSidebar: vi.fn(),
        workbenches: []
      })
    )

    act(() => hook.result.current.startPanCanvas('right'))
    hook.unmount()

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(cancelAnimationFrame).toHaveBeenCalledWith(42)
  })
})
