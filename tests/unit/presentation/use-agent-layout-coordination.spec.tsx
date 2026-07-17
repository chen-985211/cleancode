import { act, renderHook, waitFor } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { AgentGraphUpdatedEvent } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { useAgentLayoutCoordination } from '../../../src/presentation/app-shell/useAgentLayoutCoordination'

describe('Agent layout coordination', () => {
  it('keeps a user-dragged terminal protected and focuses once its commit settles', async () => {
    const terminalNode = createNode('terminal-1', 'terminal')
    const agentNode = createNode('agent:agent-1', 'agentConsole')
    const nodes = [agentNode, terminalNode]
    const fitView = vi.fn(async () => undefined)
    const moveCommit = createDeferred<void>()
    const setCurrentGraph = vi.fn()
    const { result } = renderHook(() =>
      useAgentLayoutCoordination({
        clearTerminalGroupDropPreview: vi.fn(),
        currentProjectId: 'project-1',
        currentWorkspaceName: 'main',
        moveWorkbenchNode: vi.fn(() => moveCommit.promise),
        moveWorkspaceAgent: vi.fn(async () => undefined),
        nodes,
        reactFlowInstanceRef: {
          current: createReactFlowInstance(nodes, fitView)
        },
        setCurrentGraph
      })
    )

    act(() => result.current.onNodeDragStart({} as MouseEvent, terminalNode))
    act(() => result.current.onAgentGraphUpdated(createLayoutEvent()))

    expect(setCurrentGraph).toHaveBeenCalledWith(createGraph())
    expect(fitView).not.toHaveBeenCalled()

    let committed!: Promise<void>
    act(() => {
      committed = result.current.onNodeDragStop({} as MouseEvent, terminalNode)
    })
    expect(fitView).not.toHaveBeenCalled()

    moveCommit.resolve()
    await act(() => committed)

    await waitFor(() => expect(fitView).toHaveBeenCalledOnce())
  })

  it.each([
    ['the group shell', 'group-1'],
    ['a group member', 'terminal-1']
  ])('protects the complete terminal group while dragging %s', (_label, draggedNodeId) => {
    const nodes = createGroupedNodes()
    const draggedNode = nodes.find((node) => node.id === draggedNodeId)!
    const { result } = renderHook(() =>
      useAgentLayoutCoordination({
        clearTerminalGroupDropPreview: vi.fn(),
        currentProjectId: 'project-1',
        currentWorkspaceName: 'main',
        moveWorkbenchNode: vi.fn(async () => undefined),
        moveWorkspaceAgent: vi.fn(async () => undefined),
        nodes,
        reactFlowInstanceRef: { current: null },
        setCurrentGraph: vi.fn()
      })
    )

    act(() => result.current.onNodeDragStart({} as MouseEvent, draggedNode))

    expect([...result.current.protectedLayoutNodeIds].sort()).toEqual([
      'group-1',
      'terminal-1',
      'terminal-2'
    ])
  })
})

function createLayoutEvent(): AgentGraphUpdatedEvent {
  return {
    agentId: 'agent-1',
    change: {
      blockIds: ['terminal-1'],
      kind: 'terminal_layout_arranged',
      operationId: 'tool-call-1',
      terminalGroupIds: []
    },
    graph: createGraph(),
    projectDirectory: '/repo/app',
    sessionId: 'session-1',
    workspaceName: 'main'
  }
}

function createGraph(): BlockGraphSnapshot {
  return {
    blocks: [
      {
        description: '',
        id: 'terminal-1',
        launchCommand: '',
        name: 'Terminal 1',
        position: { x: 320, y: 720 },
        size: { width: 420, height: 306 },
        type: 'terminal'
      }
    ],
    id: 'graph-1',
    projectId: 'project-1',
    terminalGroups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    workspaceName: 'main'
  }
}

function createNode(id: string, type: 'agentConsole' | 'terminal'): WorkbenchFlowNode {
  const position = id === 'terminal-1' ? { x: 320, y: 720 } : { x: 40, y: 40 }
  return { id, position, type } as WorkbenchFlowNode
}

function createGroupedNodes(): WorkbenchFlowNode[] {
  const memberBlockIds = ['terminal-1', 'terminal-2']
  const memberNodes = memberBlockIds.map(
    (id, index) =>
      ({
        id,
        position: { x: 320, y: 720 + index * 370 },
        type: 'terminal'
      }) as WorkbenchFlowNode
  )
  const groupNode = {
    id: 'group-1',
    position: { x: 288, y: 644 },
    type: 'terminalGroup',
    data: {
      group: { memberBlockIds }
    }
  } as unknown as WorkbenchFlowNode

  return [groupNode, ...memberNodes]
}

function createReactFlowInstance(
  nodes: readonly WorkbenchFlowNode[],
  fitView: ReturnType<typeof vi.fn>
): ReactFlowInstance<WorkbenchFlowNode, Edge> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))

  return {
    fitView,
    getNode: (nodeId: string) => nodesById.get(nodeId)
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
}

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T | PromiseLike<T>) => void
} {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })

  return { promise, resolve }
}
