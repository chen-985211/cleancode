import type { Edge, ReactFlowInstance, Viewport } from '@xyflow/react'
import { act, renderHook } from '@testing-library/react'

import { useApplicationShortcutNavigation } from '../../../src/presentation/app-shell/useApplicationShortcutNavigation'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'

describe('application shortcut navigation hook', () => {
  beforeEach(() => {
    stubReducedMotionPreference()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('centers a selected target even when it is already visible', () => {
    const selected = createNode('selected', 100, 100)
    const target = createNode('target', 400, 100)
    const activateWorkbenchNodeInput = vi.fn()
    const selectWorkbenchNode = vi.fn()
    const setViewport = vi.fn(async () => true)
    const hook = renderNavigationHook({
      nodes: [selected, target],
      selectedNodeId: selected.id,
      activateWorkbenchNodeInput,
      selectWorkbenchNode,
      setViewport
    })

    act(() => hook.result.current.selectCanvasNode('right'))

    expect(selectWorkbenchNode).toHaveBeenCalledWith(target)
    expect(setViewport).toHaveBeenCalledWith({ x: 20, y: 180, zoom: 1 }, { duration: 0 })
    expect(activateWorkbenchNodeInput).toHaveBeenCalledWith(target)
  })

  it('centers a distant target through the shared viewport controller', () => {
    const target = createNode('offscreen', 1_200, 700)
    const selectWorkbenchNode = vi.fn()
    const setViewport = vi.fn(async () => true)
    const hook = renderNavigationHook({
      nodes: [target],
      selectedNodeId: null,
      selectWorkbenchNode,
      setViewport
    })

    act(() => hook.result.current.selectCanvasNode('right'))

    expect(selectWorkbenchNode).toHaveBeenCalledWith(target)
    expect(setViewport).toHaveBeenCalledWith({ x: -780, y: -420, zoom: 1 }, { duration: 0 })
  })

  it('only zooms out when an oversized shortcut target exceeds the focus safe frame', () => {
    const target = createNode('oversized', 1_200, 700, { width: 1_400, height: 1_000 })
    const selectWorkbenchNode = vi.fn()
    const setViewport = vi.fn(async () => true)
    const hook = renderNavigationHook({
      nodes: [target],
      selectedNodeId: null,
      selectWorkbenchNode,
      setViewport,
      zoom: 0.9
    })

    act(() => hook.result.current.selectCanvasNode('right'))

    expect(selectWorkbenchNode).toHaveBeenCalledWith(target)
    expect(setViewport).toHaveBeenCalledOnce()
    const [viewport] = setViewport.mock.calls[0] as unknown as [
      { readonly x: number; readonly y: number; readonly zoom: number }
    ]
    expect(viewport.x).toBeCloseTo(-346.88, 2)
    expect(viewport.y).toBeCloseTo(-202.24, 2)
    expect(viewport.zoom).toBeCloseTo(0.4352, 4)
  })

  it('restores a readable zoom when the shortcut target is too small', () => {
    const target = createNode('compact', 1_200, 700, { width: 400, height: 300 })
    const setViewport = vi.fn(async () => true)
    const hook = renderNavigationHook({
      nodes: [target],
      selectedNodeId: null,
      selectWorkbenchNode: vi.fn(),
      setViewport,
      zoom: 0.5
    })

    act(() => hook.result.current.selectCanvasNode('right'))

    const [viewport] = setViewport.mock.calls[0] as unknown as [{ readonly zoom: number }]
    expect(viewport.zoom).toBe(0.9)
  })

  it('centers without spatial motion when the user prefers reduced motion', () => {
    const target = createNode('target', 600, 100)
    const setViewport = vi.fn(async () => true)
    const hook = renderNavigationHook({
      nodes: [target],
      selectedNodeId: null,
      selectWorkbenchNode: vi.fn(),
      setViewport
    })

    act(() => hook.result.current.selectCanvasNode('right'))

    expect(setViewport).toHaveBeenCalledWith({ x: -180, y: 180, zoom: 1 }, { duration: 0 })
  })

  it('retargets an in-flight transition when directional input continues', () => {
    const first = createNode('first', 100, 100)
    const second = createNode('second', 400, 100)
    const third = createNode('third', 700, 100)
    const activateWorkbenchNodeInput = vi.fn()
    const selectWorkbenchNode = vi.fn()
    const setViewport = vi.fn(async () => true)
    const hook = renderNavigationHook({
      activateWorkbenchNodeInput,
      nodes: [first, second, third],
      selectedNodeId: first.id,
      selectWorkbenchNode,
      setViewport
    })

    act(() => {
      hook.result.current.selectCanvasNode('right')
      hook.result.current.selectCanvasNode('right')
    })

    expect(selectWorkbenchNode).toHaveBeenNthCalledWith(1, second)
    expect(selectWorkbenchNode).toHaveBeenNthCalledWith(2, third)
    expect(setViewport).toHaveBeenCalledTimes(2)
    expect(activateWorkbenchNodeInput).toHaveBeenNthCalledWith(1, second)
    expect(activateWorkbenchNodeInput).toHaveBeenNthCalledWith(2, third)
  })

  it('traverses an expanded group boundary without skipping or oscillating', () => {
    const outsideLeft = createNode('outside-left', -400, 300)
    const memberLeft = createNode('member-left', 100, 400)
    const memberRight = createNode('member-right', 500, 400)
    const group = createExpandedGroupNode(['member-left', 'member-right'])
    const outsideRight = createNode('outside-right', 1_200, 300)
    const selectWorkbenchNode = vi.fn()
    const hook = renderNavigationHook({
      nodes: [outsideLeft, group, memberLeft, memberRight, outsideRight],
      selectedNodeId: outsideLeft.id,
      selectWorkbenchNode,
      setViewport: vi.fn(async () => true)
    })

    act(() => {
      hook.result.current.selectCanvasNode('right')
      hook.result.current.selectCanvasNode('right')
      hook.result.current.selectCanvasNode('right')
      hook.result.current.selectCanvasNode('right')
      hook.result.current.selectCanvasNode('right')
    })

    expect(selectWorkbenchNode.mock.calls.map(([node]) => node.id)).toEqual([
      'expanded-group',
      'member-left',
      'member-right',
      'expanded-group',
      'outside-right'
    ])
  })

  it('reactivates the selected target after its viewport transition settles', async () => {
    const target = createNode('target', 600, 100)
    const activateWorkbenchNodeInput = vi.fn()
    let resolveViewport: (value: boolean) => void = () => undefined
    const setViewport = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveViewport = resolve
        })
    )
    const hook = renderNavigationHook({
      activateWorkbenchNodeInput,
      nodes: [target],
      selectedNodeId: null,
      selectWorkbenchNode: vi.fn(),
      setViewport
    })

    act(() => hook.result.current.selectCanvasNode('right'))
    expect(activateWorkbenchNodeInput).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveViewport(true)
      await Promise.resolve()
    })

    expect(activateWorkbenchNodeInput).toHaveBeenCalledTimes(2)
    expect(activateWorkbenchNodeInput).toHaveBeenLastCalledWith(target)
  })
})

function renderNavigationHook({
  activateWorkbenchNodeInput = vi.fn(),
  nodes,
  selectedNodeId,
  selectWorkbenchNode,
  setViewport,
  zoom = 1
}: {
  readonly activateWorkbenchNodeInput?: (node: WorkbenchFlowNode) => void
  readonly nodes: WorkbenchFlowNode[]
  readonly selectedNodeId: string | null
  readonly selectWorkbenchNode: (node: WorkbenchFlowNode) => void
  readonly setViewport: SetViewportSpy
  readonly zoom?: number
}) {
  let viewport = { x: 0, y: 0, zoom }
  const reactFlowInstanceRef = {
    current: {
      getViewport: () => viewport,
      setViewport: (nextViewport: typeof viewport, options: { readonly duration: number }) => {
        viewport = nextViewport
        return setViewport(nextViewport, options)
      }
    } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
  }

  return renderHook(() =>
    useApplicationShortcutNavigation({
      canvasSizeRef: { current: { width: 960, height: 640 } },
      activateWorkbenchNodeInput,
      currentWorkbench: null,
      getNodes: () => nodes,
      onSelectWorkspace:
        vi.fn<(workbench: WorkbenchSnapshot, workspaceId: string) => Promise<void>>(),
      reactFlowInstanceRef,
      revealProjectSidebar: vi.fn(),
      selectedNodeId,
      selectWorkbenchNode,
      workbenches: []
    })
  )
}

type SetViewportSpy = ReturnType<
  typeof vi.fn<(viewport: Viewport, options: { readonly duration: number }) => Promise<boolean>>
>

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

function createNode(
  id: string,
  x: number,
  y: number,
  size = { width: 120, height: 80 }
): WorkbenchFlowNode {
  return {
    id,
    type: 'terminal',
    position: { x, y },
    style: size
  } as WorkbenchFlowNode
}

function createExpandedGroupNode(memberBlockIds: readonly string[]): WorkbenchFlowNode {
  return {
    id: 'expanded-group',
    type: 'terminalGroup',
    position: { x: 50, y: 50 },
    style: { width: 1_000, height: 800 },
    data: { group: { isCollapsed: false, memberBlockIds } }
  } as unknown as WorkbenchFlowNode
}
