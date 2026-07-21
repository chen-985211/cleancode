import { act, render, waitFor } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'

import type { AgentGraphUpdatedEvent } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { useAgentLayoutCoordination } from '../../../src/presentation/app-shell/useAgentLayoutCoordination'
import { useWorkbenchFlowNodes } from '../../../src/presentation/app-shell/useWorkbenchFlowNodes'
import type {
  WorkbenchFlowNode,
  WorkbenchSnapshot
} from '../../../src/presentation/app-shell/types'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbenchNodeStore'

describe('Agent layout projection timing', () => {
  it('fits the arranged geometry after the existing terminal node has been reprojected', async () => {
    const fitView = vi.fn(async (options: { readonly nodes?: readonly WorkbenchFlowNode[] }) => {
      void options
    })
    let publishGraphUpdate: ((event: AgentGraphUpdatedEvent) => void) | undefined

    render(
      <Harness
        fitView={fitView}
        onReady={(listener) => {
          publishGraphUpdate = listener
        }}
      />
    )

    await waitFor(() => expect(publishGraphUpdate).toBeDefined())

    act(() => publishGraphUpdate?.(createLayoutEvent()))

    await waitFor(() => expect(fitView).toHaveBeenCalledOnce())
    const focusedNodes = fitView.mock.calls[0]![0].nodes as WorkbenchFlowNode[]

    expect(focusedNodes.find((node) => node.id === 'terminal-1')?.position).toEqual({
      x: 320,
      y: 720
    })
  })
})

function Harness({
  fitView,
  onReady
}: {
  readonly fitView: ReturnType<typeof vi.fn>
  readonly onReady: (listener: (event: AgentGraphUpdatedEvent) => void) => void
}) {
  const [graph, setGraph] = useState(createGraph({ x: 80, y: 80 }))
  const [nodeStore] = useState(() => createWorkbenchNodeStore())
  const reactFlowInstanceRef = useRef({
    fitView,
    getNode: (nodeId: string) => nodeStore.getNodes().find((node) => node.id === nodeId)
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>)
  const coordination = useAgentLayoutCoordination({
    clearTerminalGroupDropPreview: noop,
    currentProjectId: workbench.project.id,
    currentWorkspaceName: currentWorkspace.name,
    moveWorkbenchNode: noopAsync,
    moveWorkspaceAgent: noopAsync,
    nodeStore,
    reactFlowInstanceRef,
    setCurrentGraph: setGraph
  })

  useWorkbenchFlowNodes({
    agentToolApprovals,
    currentWorkbench: workbench,
    currentWorkspace,
    graph,
    handlers: terminalHandlers,
    hoveredTerminalBlockId: null,
    isTerminalGroupSelectionMode: false,
    onAgentGraphUpdated: coordination.onAgentGraphUpdated,
    onMcpCapabilityChange: noopOptionalAsync,
    onRemoveAgent: noopAsync,
    onRenameAgent: noopAsync,
    onResizeAgent: noopAsync,
    onSelectAgent: noop,
    protectedLayoutNodeIds: coordination.protectedLayoutNodeIds,
    selectedAgentId: null,
    selectedTerminalBlockIds: emptyIds,
    selectedTerminalGroupId: null,
    selectedUngroupedTerminalBlockIds: emptyIds,
    setNodes: nodeStore.setNodes,
    terminalStates
  })

  useEffect(
    () => onReady(coordination.onAgentGraphUpdated),
    [coordination.onAgentGraphUpdated, onReady]
  )

  return null
}

function createLayoutEvent(): AgentGraphUpdatedEvent {
  return {
    agentId: 'agent-1',
    change: {
      blockIds: ['terminal-1'],
      kind: 'terminal_layout_arranged',
      operationId: 'tool-call-1',
      terminalGroupIds: []
    },
    graph: createGraph({ x: 320, y: 720 }),
    projectDirectory: workbench.project.directory,
    sessionId: 'session-1',
    workspaceName: currentWorkspace.name
  }
}

function createGraph(position: { readonly x: number; readonly y: number }): BlockGraphSnapshot {
  return {
    blocks: [
      {
        description: '',
        id: 'terminal-1',
        launchCommand: '',
        name: 'Terminal 1',
        position,
        size: { width: 420, height: 306 },
        type: 'terminal'
      }
    ],
    id: 'graph-alpha-project',
    projectId: 'project-alpha-project',
    terminalGroups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    workspaceName: 'main'
  }
}

const workbench: WorkbenchSnapshot = {
  ...createWorkbenchSnapshot('/tmp/alpha-project', 'alpha-project'),
  agents: [
    {
      agentId: 'agent-1',
      cleancodeMcpEnabled: true,
      layout: {
        position: { x: 40, y: 40 },
        size: { width: 560, height: 520 }
      },
      name: 'Agent 1',
      projectId: 'project-alpha-project',
      workspaceName: 'main'
    }
  ],
  graph: createGraph({ x: 80, y: 80 })
}
const currentWorkspace = workbench.project.workspaces[0]!
const terminalHandlers = {} as never
const emptyIds: readonly string[] = []
const terminalStates = {}
const agentToolApprovals = {
  approvals: [],
  approve: noopAsync,
  clearForAgent: noop,
  dismiss: noop,
  locate: noop,
  reject: noopAsync
}

function noop(): void {}
async function noopAsync(): Promise<void> {}
async function noopOptionalAsync(): Promise<undefined> {
  return undefined
}
