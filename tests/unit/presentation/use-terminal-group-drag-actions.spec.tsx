import { renderHook } from '@testing-library/react'

import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'
import { createTerminalFlowNodes } from '../../../src/presentation/app-shell/projections/terminalFlowNodes'
import type { TerminalFlowNode } from '../../../src/presentation/app-shell/types/terminalFlowNode'
import { useTerminalGroupDragActions } from '../../../src/presentation/app-shell/coordinators/useTerminalGroupDragActions'
import { createWorkbenchNodeLayoutCommitQueue } from '../../../src/presentation/app-shell/workbench/nodes/workbenchNodeLayoutCommitQueue'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbench/nodes/workbenchNodeStore'

describe('terminal group drag actions', () => {
  it('restores authoritative terminal geometry when the layout commit fails', async () => {
    const baseWorkbench = createWorkbenchSnapshot('/repo/app', 'app')
    const block = {
      description: '',
      id: 'terminal-1',
      launchCommand: '',
      name: 'Terminal 1',
      position: { x: 120, y: 160 },
      size: { width: 420, height: 306 },
      type: 'terminal' as const
    }
    const workbench = {
      ...baseWorkbench,
      graph: { ...baseWorkbench.graph, blocks: [block] }
    }
    const [terminalNode] = createTerminalFlowNodes({
      graph: workbench.graph,
      handlers: {} as never,
      hoveredTerminalBlockId: null,
      terminalStates: {}
    }) as TerminalFlowNode[]
    const movedNode = { ...terminalNode, position: { x: 860, y: 520 } }
    const nodeStore = createWorkbenchNodeStore([movedNode])
    const runtimeApi = createRuntimeApi()
    runtimeApi.moveBlock.mockRejectedValue(new Error('layout commit failed'))
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: runtimeApi
    })
    const { result } = renderHook(() =>
      useTerminalGroupDragActions({
        currentWorkbench: workbench,
        currentWorkspace: workbench.project.workspaces[0],
        getNodes: nodeStore.getNodes,
        graph: workbench.graph,
        isTerminalGroupSelectionMode: false,
        layoutCommitQueue: createWorkbenchNodeLayoutCommitQueue(),
        setCurrentGraph: vi.fn(),
        setNodes: nodeStore.setNodes
      })
    )

    await expect(result.current.moveWorkbenchNode({} as MouseEvent, movedNode)).rejects.toThrow(
      'layout commit failed'
    )

    expect(nodeStore.getNodes()[0]?.position).toEqual(block.position)
  })
})
