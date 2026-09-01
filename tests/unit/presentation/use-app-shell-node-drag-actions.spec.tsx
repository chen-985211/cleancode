import { act, renderHook } from '@testing-library/react'

import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { useAppShellNodeDragActions } from '../../../src/presentation/app-shell/coordinators/useAppShellNodeDragActions'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbenchNodeStore'

describe('AppShell node drag actions', () => {
  it('restores committed terminal layout before binding a quick execution drop', async () => {
    const movedNode = {
      id: 'terminal-1',
      position: { x: 800, y: 600 },
      style: { width: 720, height: 460 },
      type: 'terminal'
    } as WorkbenchFlowNode
    const nodeStore = createWorkbenchNodeStore([movedNode])
    const addQuickExecutionTarget = vi.fn(async () => undefined)
    const cancelNodeDrag = vi.fn()
    const { result } = renderHook(() =>
      useAppShellNodeDragActions({
        addQuickExecutionTarget,
        cancelNodeDrag,
        graph: createGraph(),
        layoutSaveFailedMessage: 'Save failed',
        layoutSaveFailedTitle: 'Layout',
        nodeStore,
        notify: vi.fn(),
        onNodeDragStop: vi.fn(async () => undefined)
      })
    )

    await act(() =>
      result.current.bindQuickExecutionFromNodeDrop(
        { type: 'terminal', terminalBlockId: 'terminal-1' },
        movedNode
      )
    )

    expect(cancelNodeDrag).toHaveBeenCalledWith('terminal-1')
    expect(nodeStore.getNodes()[0]?.position).toEqual({ x: 120, y: 160 })
    expect(addQuickExecutionTarget).toHaveBeenCalledWith({
      type: 'terminal',
      terminalBlockId: 'terminal-1'
    })
  })
})

function createGraph(): BlockGraphSnapshot {
  return {
    blocks: [
      {
        description: '',
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
        id: 'terminal-1',
        launchCommand: 'pnpm dev',
        name: 'Terminal 1',
        position: { x: 120, y: 160 },
        size: { width: 720, height: 460 },
        type: 'terminal'
      }
    ],
    connections: [],
    id: 'graph-1',
    projectId: 'project-1',
    quickExecutionSlots: [
      { number: 1, target: null },
      { number: 2, target: null },
      { number: 3, target: null },
      { number: 4, target: null },
      { number: 5, target: null }
    ],
    terminalGroups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    workspaceId: 'main'
  }
}
