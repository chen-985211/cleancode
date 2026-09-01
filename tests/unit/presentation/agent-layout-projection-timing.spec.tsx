import { act, render, waitFor } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'
import { useEffect, useRef, useState } from 'react'

import type { AgentGraphUpdatedEvent } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { useAgentLayoutCoordination } from '../../../src/presentation/app-shell/coordinators/useAgentLayoutCoordination'
import { useWorkbenchFlowNodes } from '../../../src/presentation/app-shell/coordinators/useWorkbenchFlowNodes'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import type { WorkbenchSnapshot } from '../../../src/presentation/app-shell/types/workbenchSnapshot'
import { createWorkbenchSnapshot } from '../../fixtures/presentation/appShellFixtures'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbench/nodes/workbenchNodeStore'

describe('Agent layout projection timing', () => {
  beforeEach(() => {
    stubReducedMotionPreference()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fits the arranged geometry after the existing terminal node has been reprojected', async () => {
    const getNodesBounds = vi.fn((nodes: readonly WorkbenchFlowNode[]) => {
      void nodes
      return { height: 1_026, width: 840, x: 40, y: 40 }
    })
    let publishGraphUpdate: ((event: AgentGraphUpdatedEvent) => void) | undefined

    render(
      <Harness
        getNodesBounds={getNodesBounds}
        onReady={(listener) => {
          publishGraphUpdate = listener
        }}
      />
    )

    await waitFor(() => expect(publishGraphUpdate).toBeDefined())

    act(() => publishGraphUpdate?.(createLayoutEvent()))

    await waitFor(() => expect(getNodesBounds).toHaveBeenCalledOnce())
    const focusedNodes = getNodesBounds.mock.calls[0]![0]

    expect(focusedNodes.find((node) => node.id === 'terminal-1')?.position).toEqual({
      x: 320,
      y: 720
    })
  })
})

function Harness({
  getNodesBounds,
  onReady
}: {
  readonly getNodesBounds: ReturnType<typeof vi.fn>
  readonly onReady: (listener: (event: AgentGraphUpdatedEvent) => void) => void
}) {
  const [graph, setGraph] = useState(createGraph({ x: 80, y: 80 }))
  const [nodeStore] = useState(() => createWorkbenchNodeStore())
  const reactFlowInstanceRef = useRef({
    getNode: (nodeId: string) => nodeStore.getNodes().find((node) => node.id === nodeId),
    getNodesBounds,
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport: vi.fn(async () => true)
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>)
  const coordination = useAgentLayoutCoordination({
    clearTerminalGroupDropPreview: noop,
    currentProjectId: workbench.project.id,
    currentWorkspaceId: currentWorkspace.workspaceId,
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
    editingTerminalGroupId: null,
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
    workspaceId: currentWorkspace.workspaceId
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
    workspaceId: 'main'
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
      providerId: 'codex',
      workspaceId: 'main'
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
