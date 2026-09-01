import { act, render, waitFor } from '@testing-library/react'
import type { Dispatch, SetStateAction } from 'react'

import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalViewState } from '../../../src/contexts/run/presentation/view-models/TerminalPresentationTypes'
import { createTerminalStateStore } from '../../../src/contexts/run/presentation/view-models/terminalStateStore'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { useWorkbenchFlowNodes } from '../../../src/presentation/app-shell/coordinators/useWorkbenchFlowNodes'

describe('Workbench flow node runtime isolation', () => {
  it('does not reproject the React Flow node set for a terminal-only runtime update', async () => {
    const initialStates = {
      'terminal-1': createTerminalState('terminal-1'),
      'terminal-2': createTerminalState('terminal-2')
    }
    const terminalStateStore = createTerminalStateStore(initialStates)
    const nodeProjection = createNodeProjectionRecorder()
    const view = render(
      <Harness
        setNodes={nodeProjection.setNodes}
        terminalStates={initialStates}
        terminalStateStore={terminalStateStore}
      />
    )

    await waitFor(() => expect(nodeProjection.setNodes).toHaveBeenCalled())
    const initialNodes = nodeProjection.getNodes()
    nodeProjection.setNodes.mockClear()
    const nextStates = {
      ...initialStates,
      'terminal-2': { ...initialStates['terminal-2'], status: 'running' as const }
    }

    act(() => terminalStateStore.replaceStates(nextStates))
    view.rerender(
      <Harness
        setNodes={nodeProjection.setNodes}
        terminalStates={nextStates}
        terminalStateStore={terminalStateStore}
      />
    )

    expect(nodeProjection.setNodes).not.toHaveBeenCalled()
    expect(nodeProjection.getNodes()).toBe(initialNodes)
  })
})

function Harness({
  setNodes,
  terminalStates,
  terminalStateStore
}: {
  readonly setNodes: Dispatch<SetStateAction<WorkbenchFlowNode[]>>
  readonly terminalStates: Record<string, TerminalViewState>
  readonly terminalStateStore: ReturnType<typeof createTerminalStateStore>
}) {
  useWorkbenchFlowNodes({
    agentToolApprovals: inactiveApprovals,
    currentWorkbench: null,
    currentWorkspace: undefined,
    graph,
    handlers: terminalHandlers,
    hoveredTerminalBlockId: null,
    editingTerminalGroupId: null,
    isTerminalGroupSelectionMode: false,
    onAgentGraphUpdated: agentHandlers.onGraphUpdated,
    onMcpCapabilityChange: agentHandlers.onMcpCapabilityChange,
    onRemoveAgent: agentHandlers.onRemove,
    onRenameAgent: agentHandlers.onRename,
    onResizeAgent: agentHandlers.onResize,
    onSelectAgent: agentHandlers.onSelect,
    protectedLayoutNodeIds: emptyNodeIds,
    selectedAgentId: null,
    selectedTerminalBlockIds: emptyIds,
    selectedTerminalGroupId: null,
    setNodes,
    terminalStates,
    terminalStateStore
  })
  return null
}

function createNodeProjectionRecorder() {
  let nodes: WorkbenchFlowNode[] = []
  const setNodes = vi.fn<Dispatch<SetStateAction<WorkbenchFlowNode[]>>>((value) => {
    nodes = typeof value === 'function' ? value(nodes) : value
  })
  return { getNodes: () => nodes, setNodes }
}

function createTerminalState(id: string): TerminalViewState {
  return { output: id, sessionId: `session-${id}`, status: 'exited' }
}

const graph: BlockGraphSnapshot = {
  blocks: [
    {
      description: '',
      id: 'terminal-1',
      launchCommand: '',
      name: 'Terminal 1',
      position: { x: 40, y: 40 },
      size: { height: 320, width: 440 },
      type: 'terminal'
    },
    {
      description: '',
      id: 'terminal-2',
      launchCommand: '',
      name: 'Terminal 2',
      position: { x: 520, y: 40 },
      size: { height: 320, width: 440 },
      type: 'terminal'
    }
  ],
  connections: [],
  id: 'graph-1',
  projectId: 'project-1',
  terminalGroups: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  workspaceId: 'workspace-1'
}
const emptyIds: readonly string[] = []
const emptyNodeIds = new Set<string>()
const terminalHandlers = {} as never
const agentHandlers = {
  onGraphUpdated: vi.fn(),
  onMcpCapabilityChange: vi.fn(async () => undefined),
  onRemove: vi.fn(async () => undefined),
  onRename: vi.fn(async () => undefined),
  onResize: vi.fn(async () => undefined),
  onSelect: vi.fn()
}
const inactiveApprovals = {
  approvals: [],
  approve: vi.fn(async () => undefined),
  clearForAgent: vi.fn(),
  dismiss: vi.fn(),
  locate: vi.fn(),
  reject: vi.fn(async () => undefined)
}
