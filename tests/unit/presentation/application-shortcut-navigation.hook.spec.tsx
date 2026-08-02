import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { act, renderHook } from '@testing-library/react'

import { useApplicationShortcutNavigation } from '../../../src/presentation/app-shell/useApplicationShortcutNavigation'
import type {
  WorkbenchFlowNode,
  WorkbenchSnapshot
} from '../../../src/presentation/app-shell/types'

describe('application shortcut navigation hook', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('smoothly centers a selected target even when it is already visible', () => {
    const selected = createNode('selected', 100, 100)
    const target = createNode('target', 400, 100)
    const activateWorkbenchNodeInput = vi.fn()
    const selectWorkbenchNode = vi.fn()
    const setCenter = vi.fn(async () => true)
    const hook = renderNavigationHook({
      nodes: [selected, target],
      selectedNodeId: selected.id,
      activateWorkbenchNodeInput,
      selectWorkbenchNode,
      setCenter
    })

    act(() => hook.result.current.selectCanvasNode('right'))

    expect(selectWorkbenchNode).toHaveBeenCalledWith(target)
    expect(setCenter).toHaveBeenCalledWith(460, 140, {
      duration: 191,
      interpolate: 'linear',
      zoom: 1
    })
    expect(activateWorkbenchNodeInput).toHaveBeenCalledWith(target)
  })

  it('gives a distant target more travel time while keeping the transition compact', () => {
    const target = createNode('offscreen', 1_200, 700)
    const selectWorkbenchNode = vi.fn()
    const setCenter = vi.fn(async () => true)
    const hook = renderNavigationHook({
      nodes: [target],
      selectedNodeId: null,
      selectWorkbenchNode,
      setCenter
    })

    act(() => hook.result.current.selectCanvasNode('right'))

    expect(selectWorkbenchNode).toHaveBeenCalledWith(target)
    expect(setCenter).toHaveBeenCalledWith(1_260, 740, {
      duration: 233,
      interpolate: 'linear',
      zoom: 1
    })
  })

  it('only zooms out when an oversized shortcut target exceeds the focus safe frame', () => {
    const target = createNode('oversized', 1_200, 700, { width: 1_400, height: 1_000 })
    const selectWorkbenchNode = vi.fn()
    const setCenter = vi.fn(async () => true)
    const hook = renderNavigationHook({
      nodes: [target],
      selectedNodeId: null,
      selectWorkbenchNode,
      setCenter,
      zoom: 0.9
    })

    act(() => hook.result.current.selectCanvasNode('right'))

    expect(selectWorkbenchNode).toHaveBeenCalledWith(target)
    expect(setCenter).toHaveBeenCalledOnce()
    const [centerX, centerY, options] = setCenter.mock.calls[0] as unknown as [
      number,
      number,
      { readonly duration: number; readonly interpolate: string; readonly zoom: number }
    ]
    expect(centerX).toBe(1_900)
    expect(centerY).toBe(1_200)
    expect(options.duration).toBeGreaterThanOrEqual(180)
    expect(options.duration).toBeLessThanOrEqual(260)
    expect(options.interpolate).toBe('linear')
    expect(options.zoom).toBeCloseTo(0.4352, 4)
  })

  it('restores a readable zoom when the shortcut target is too small', () => {
    const target = createNode('compact', 1_200, 700, { width: 400, height: 300 })
    const setCenter = vi.fn(async () => true)
    const hook = renderNavigationHook({
      nodes: [target],
      selectedNodeId: null,
      selectWorkbenchNode: vi.fn(),
      setCenter,
      zoom: 0.5
    })

    act(() => hook.result.current.selectCanvasNode('right'))

    const options = (
      setCenter.mock.calls[0] as unknown as [number, number, { readonly zoom: number }]
    )[2]
    expect(options.zoom).toBe(0.9)
  })

  it('centers without spatial motion when the user prefers reduced motion', () => {
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
    const target = createNode('target', 600, 100)
    const setCenter = vi.fn(async () => true)
    const hook = renderNavigationHook({
      nodes: [target],
      selectedNodeId: null,
      selectWorkbenchNode: vi.fn(),
      setCenter
    })

    act(() => hook.result.current.selectCanvasNode('right'))

    expect(setCenter).toHaveBeenCalledWith(660, 140, {
      duration: 0,
      interpolate: 'linear',
      zoom: 1
    })
  })

  it('retargets an in-flight transition when directional input continues', () => {
    const first = createNode('first', 100, 100)
    const second = createNode('second', 400, 100)
    const third = createNode('third', 700, 100)
    const activateWorkbenchNodeInput = vi.fn()
    const selectWorkbenchNode = vi.fn()
    const setCenter = vi.fn(async () => true)
    const hook = renderNavigationHook({
      activateWorkbenchNodeInput,
      nodes: [first, second, third],
      selectedNodeId: first.id,
      selectWorkbenchNode,
      setCenter
    })

    act(() => {
      hook.result.current.selectCanvasNode('right')
      hook.result.current.selectCanvasNode('right')
    })

    expect(selectWorkbenchNode).toHaveBeenNthCalledWith(1, second)
    expect(selectWorkbenchNode).toHaveBeenNthCalledWith(2, third)
    expect(setCenter).toHaveBeenCalledTimes(2)
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
      setCenter: vi.fn(async () => true)
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
    let resolveCenter: (value: boolean) => void = () => undefined
    const setCenter = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCenter = resolve
        })
    )
    const hook = renderNavigationHook({
      activateWorkbenchNodeInput,
      nodes: [target],
      selectedNodeId: null,
      selectWorkbenchNode: vi.fn(),
      setCenter
    })

    act(() => hook.result.current.selectCanvasNode('right'))
    expect(activateWorkbenchNodeInput).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveCenter(true)
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
  setCenter,
  zoom = 1
}: {
  readonly activateWorkbenchNodeInput?: (node: WorkbenchFlowNode) => void
  readonly nodes: WorkbenchFlowNode[]
  readonly selectedNodeId: string | null
  readonly selectWorkbenchNode: (node: WorkbenchFlowNode) => void
  readonly setCenter: ReturnType<typeof vi.fn>
  readonly zoom?: number
}) {
  const reactFlowInstanceRef = {
    current: {
      getViewport: () => ({ x: 0, y: 0, zoom }),
      setCenter
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
