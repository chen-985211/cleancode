import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { act, renderHook } from '@testing-library/react'

import { useApplicationShortcutNavigation } from '../../../src/presentation/app-shell/useApplicationShortcutNavigation'
import type {
  WorkbenchFlowNode,
  WorkbenchSnapshot
} from '../../../src/presentation/app-shell/types'

describe('application shortcut navigation hook', () => {
  it('immediately centers a selected target even when it is already visible', () => {
    const selected = createNode('selected', 100, 100)
    const target = createNode('target', 400, 100)
    const selectWorkbenchNode = vi.fn()
    const setCenter = vi.fn(async () => true)
    const hook = renderNavigationHook({
      nodes: [selected, target],
      selectedNodeId: selected.id,
      selectWorkbenchNode,
      setCenter
    })

    act(() => hook.result.current.selectCanvasNode('right'))

    expect(selectWorkbenchNode).toHaveBeenCalledWith(target)
    expect(setCenter).toHaveBeenCalledWith(460, 140, { duration: 0, zoom: 1 })
  })

  it('immediately centers a selected target when it is outside the viewport', () => {
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
    expect(setCenter).toHaveBeenCalledWith(1_260, 740, { duration: 0, zoom: 1 })
  })
})

function renderNavigationHook({
  nodes,
  selectedNodeId,
  selectWorkbenchNode,
  setCenter
}: {
  readonly nodes: WorkbenchFlowNode[]
  readonly selectedNodeId: string | null
  readonly selectWorkbenchNode: (node: WorkbenchFlowNode) => void
  readonly setCenter: ReturnType<typeof vi.fn>
}) {
  const reactFlowInstanceRef = {
    current: {
      getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
      setCenter
    } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
  }

  return renderHook(() =>
    useApplicationShortcutNavigation({
      canvasSizeRef: { current: { width: 960, height: 640 } },
      currentWorkbench: null,
      getNodes: () => nodes,
      onSelectWorkspace:
        vi.fn<(workbench: WorkbenchSnapshot, workspaceName: string) => Promise<void>>(),
      reactFlowInstanceRef,
      revealProjectSidebar: vi.fn(),
      selectedNodeId,
      selectWorkbenchNode,
      workbenches: []
    })
  )
}

function createNode(id: string, x: number, y: number): WorkbenchFlowNode {
  return {
    id,
    type: 'terminal',
    position: { x, y },
    style: { width: 120, height: 80 }
  } as WorkbenchFlowNode
}
