import { act, renderHook, waitFor } from '@testing-library/react'
import type { Edge, ReactFlowInstance } from '@xyflow/react'

import type { AgentGraphUpdatedEvent } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types/workbenchFlowNode'
import { useAgentLayoutCoordination } from '../../../src/presentation/app-shell/coordinators/useAgentLayoutCoordination'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbenchNodeStore'

describe('Agent layout coordination', () => {
  beforeEach(() => {
    stubReducedMotionPreference()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps a user-dragged terminal protected and focuses once its commit settles', async () => {
    const terminalNode = createNode('terminal-1', 'terminal')
    const agentNode = createNode('agent:agent-1', 'agentConsole')
    const nodes = [agentNode, terminalNode]
    const nodeStore = createWorkbenchNodeStore(nodes)
    const setViewport = vi.fn(async () => true)
    const moveCommit = createDeferred<void>()
    const setCurrentGraph = vi.fn()
    const { result } = renderHook(() =>
      useAgentLayoutCoordination({
        clearTerminalGroupDropPreview: vi.fn(),
        currentProjectId: 'project-1',
        currentWorkspaceId: 'main',
        moveWorkbenchNode: vi.fn(() => moveCommit.promise),
        moveWorkspaceAgent: vi.fn(async () => undefined),
        nodeStore,
        reactFlowInstanceRef: {
          current: createReactFlowInstance(nodes, setViewport)
        },
        setCurrentGraph
      })
    )

    act(() => result.current.onNodeDragStart({} as MouseEvent, terminalNode))
    act(() => result.current.onAgentGraphUpdated(createLayoutEvent()))

    expect(setCurrentGraph).toHaveBeenCalledWith(createGraph())
    expect(setViewport).not.toHaveBeenCalled()

    let committed!: Promise<void>
    act(() => {
      committed = result.current.onNodeDragStop({} as MouseEvent, terminalNode)
    })
    expect(setViewport).not.toHaveBeenCalled()

    moveCommit.resolve()
    await act(() => committed)

    await waitFor(() => expect(setViewport).toHaveBeenCalledOnce())
  })

  it.each([
    ['the group shell', 'group-1'],
    ['a group member', 'terminal-1']
  ])('protects the complete terminal group while dragging %s', (_label, draggedNodeId) => {
    const nodes = createGroupedNodes()
    const nodeStore = createWorkbenchNodeStore(nodes)
    const draggedNode = nodes.find((node) => node.id === draggedNodeId)!
    const { result } = renderHook(() =>
      useAgentLayoutCoordination({
        clearTerminalGroupDropPreview: vi.fn(),
        currentProjectId: 'project-1',
        currentWorkspaceId: 'main',
        moveWorkbenchNode: vi.fn(async () => undefined),
        moveWorkspaceAgent: vi.fn(async () => undefined),
        nodeStore,
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

  it('restores authoritative Agent geometry when the layout commit fails', async () => {
    const agent = {
      agentId: 'agent-1',
      cleancodeMcpEnabled: true,
      layout: {
        position: { x: 40, y: 40 },
        size: { width: 440, height: 520 }
      },
      name: 'Agent 1',
      projectId: 'project-1',
      workspaceId: 'main'
    }
    const movedAgentNode = {
      id: 'agent:agent-1',
      data: { agent },
      position: { x: 720, y: 480 },
      style: { width: 440, height: 520 },
      type: 'agentConsole'
    } as WorkbenchFlowNode
    const nodeStore = createWorkbenchNodeStore([movedAgentNode])
    const { result } = renderHook(() =>
      useAgentLayoutCoordination({
        clearTerminalGroupDropPreview: vi.fn(),
        currentProjectId: 'project-1',
        currentWorkspaceId: 'main',
        moveWorkbenchNode: vi.fn(async () => undefined),
        moveWorkspaceAgent: vi.fn(async () => {
          throw new Error('layout commit failed')
        }),
        nodeStore,
        reactFlowInstanceRef: { current: null },
        setCurrentGraph: vi.fn()
      })
    )

    await expect(result.current.onNodeDragStop({} as MouseEvent, movedAgentNode)).rejects.toThrow(
      'layout commit failed'
    )

    expect(nodeStore.getNodes()[0]?.position).toEqual(agent.layout.position)
  })

  it('does not recenter after the user takes control of the viewport', async () => {
    const terminalNode = createNode('terminal-1', 'terminal')
    const agentNode = createNode('agent:agent-1', 'agentConsole')
    const nodes = [agentNode, terminalNode]
    const setViewport = vi.fn(async () => true)
    const onCancelLayoutFocus = vi.fn()
    const nodeStore = createWorkbenchNodeStore(nodes)
    const { result } = renderHook(() =>
      useAgentLayoutCoordination({
        clearTerminalGroupDropPreview: vi.fn(),
        currentProjectId: 'project-1',
        currentWorkspaceId: 'main',
        moveWorkbenchNode: vi.fn(async () => undefined),
        moveWorkspaceAgent: vi.fn(async () => undefined),
        nodeStore,
        onCancelLayoutFocus,
        reactFlowInstanceRef: { current: createReactFlowInstance(nodes, setViewport) },
        setCurrentGraph: vi.fn()
      })
    )

    act(() => result.current.onAgentGraphUpdated(createLayoutEvent()))
    act(() => result.current.cancelLayoutFocus())
    await act(() => Promise.resolve())

    expect(setViewport).not.toHaveBeenCalled()
    expect(onCancelLayoutFocus).toHaveBeenCalledOnce()
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
    workspaceId: 'main'
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
    workspaceId: 'main'
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
  setViewport: ReturnType<typeof vi.fn>
): ReactFlowInstance<WorkbenchFlowNode, Edge> {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))

  return {
    getNode: (nodeId: string) => nodesById.get(nodeId),
    getNodesBounds: () => ({ height: 1_026, width: 840, x: 40, y: 40 }),
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport
  } as unknown as ReactFlowInstance<WorkbenchFlowNode, Edge>
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
