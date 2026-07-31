import { act, renderHook } from '@testing-library/react'

import type { AgentGraphUpdatedEvent } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import { useAgentLayoutCoordination } from '../../../src/presentation/app-shell/useAgentLayoutCoordination'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { createWorkbenchNodeStore } from '../../../src/presentation/app-shell/workbenchNodeStore'

describe('terminal workflow build coordination', () => {
  let animationFrames: Map<number, FrameRequestCallback>
  let nextAnimationFrameId: number

  beforeEach(() => {
    animationFrames = new Map()
    nextAnimationFrameId = 1
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextAnimationFrameId++
      animationFrames.set(id, callback)
      return id
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      animationFrames.delete(id)
    })
  })

  afterEach(() => vi.restoreAllMocks())

  it('places dependency layers from the Agent edge as one continuous committed presentation', () => {
    const graph = createGraph(['terminal-api', 'terminal-web'])
    const agentNode = createAgentNode()
    const nodeStore = createWorkbenchNodeStore([agentNode])
    const { result } = renderHook(() =>
      useAgentLayoutCoordination({
        clearTerminalGroupDropPreview: vi.fn(),
        currentProjectId: 'project-1',
        currentWorkspaceId: 'main',
        moveWorkbenchNode: vi.fn(async () => undefined),
        moveWorkspaceAgent: vi.fn(async () => undefined),
        nodeStore,
        reactFlowInstanceRef: { current: null },
        setCurrentGraph: (nextGraph) => {
          nodeStore.setNodes([agentNode, ...createTerminalNodes(nextGraph)])
        }
      })
    )

    act(() =>
      result.current.onAgentGraphUpdated(createEvent(graph, ['terminal-api', 'terminal-web']))
    )
    runAnimationFrame(0)

    const initialApiPosition = findNode(nodeStore, 'terminal-api').position
    const initialWebPosition = findNode(nodeStore, 'terminal-web').position
    expect(initialApiPosition).not.toEqual(graph.blocks[0]!.position)
    expect(initialWebPosition).not.toEqual(graph.blocks[1]!.position)
    expect(result.current.terminalWorkflowBuildPresentation?.pendingConnectionIds).toContain(
      'connection-api-web'
    )

    runAnimationFrame(120)

    expect(findNode(nodeStore, 'terminal-api').position).not.toEqual(initialApiPosition)
    expect(findNode(nodeStore, 'terminal-web').position).toEqual(initialWebPosition)
    expect(result.current.terminalWorkflowBuildPresentation?.pendingConnectionIds).toContain(
      'connection-api-web'
    )

    runAnimationFrame(560)

    expect(findNode(nodeStore, 'terminal-web').position).not.toEqual(initialWebPosition)
    expect(result.current.terminalWorkflowBuildPresentation?.enteringConnectionIds).toContain(
      'connection-api-web'
    )

    runAnimationFrame(1_300)

    expect(findNode(nodeStore, 'terminal-api').position).toEqual(graph.blocks[0]!.position)
    expect(findNode(nodeStore, 'terminal-web').position).toEqual(graph.blocks[1]!.position)
    expect(result.current.terminalWorkflowBuildPresentation).toBeNull()
  })

  it('stops moving a terminal as soon as the user starts dragging it', () => {
    const graph = createGraph(['terminal-api'])
    const agentNode = createAgentNode()
    const nodeStore = createWorkbenchNodeStore([agentNode])
    const { result } = renderHook(() =>
      useAgentLayoutCoordination({
        clearTerminalGroupDropPreview: vi.fn(),
        currentProjectId: 'project-1',
        currentWorkspaceId: 'main',
        moveWorkbenchNode: vi.fn(async () => undefined),
        moveWorkspaceAgent: vi.fn(async () => undefined),
        nodeStore,
        reactFlowInstanceRef: { current: null },
        setCurrentGraph: (nextGraph) => {
          nodeStore.setNodes([agentNode, ...createTerminalNodes(nextGraph)])
        }
      })
    )

    act(() => result.current.onAgentGraphUpdated(createEvent(graph, ['terminal-api'])))
    runAnimationFrame(0)
    nodeStore.setNodes((nodes) =>
      nodes.map((node) =>
        node.id === 'terminal-api' ? { ...node, position: { x: 777, y: 555 } } : node
      )
    )
    const draggedNode = findNode(nodeStore, 'terminal-api')
    act(() => result.current.onNodeDragStart({} as MouseEvent, draggedNode))

    runAnimationFrame(500)

    expect(findNode(nodeStore, 'terminal-api').position).toEqual({ x: 777, y: 555 })
  })

  it('settles the previous build before a newer committed graph starts', () => {
    const firstGraph = createGraph(['terminal-api'])
    const secondGraph = createGraph(['terminal-api', 'terminal-worker'])
    const agentNode = createAgentNode()
    const nodeStore = createWorkbenchNodeStore([agentNode])
    const { result } = renderHook(() =>
      useAgentLayoutCoordination({
        clearTerminalGroupDropPreview: vi.fn(),
        currentProjectId: 'project-1',
        currentWorkspaceId: 'main',
        moveWorkbenchNode: vi.fn(async () => undefined),
        moveWorkspaceAgent: vi.fn(async () => undefined),
        nodeStore,
        reactFlowInstanceRef: { current: null },
        setCurrentGraph: (nextGraph) => {
          nodeStore.setNodes([agentNode, ...createTerminalNodes(nextGraph)])
        }
      })
    )

    act(() => result.current.onAgentGraphUpdated(createEvent(firstGraph, ['terminal-api'])))
    runAnimationFrame(0)
    act(() => result.current.onAgentGraphUpdated(createEvent(secondGraph, ['terminal-worker'])))

    expect(findNode(nodeStore, 'terminal-api').position).toEqual(secondGraph.blocks[0]!.position)
    runAnimationFrame(20)
    expect(findNode(nodeStore, 'terminal-worker').position).not.toEqual(
      secondGraph.blocks[1]!.position
    )
  })

  it('projects the final graph without staged movement for reduced motion', () => {
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      addEventListener: vi.fn(),
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      removeEventListener: vi.fn()
    } as unknown as MediaQueryList)
    const graph = createGraph(['terminal-api'])
    const agentNode = createAgentNode()
    const nodeStore = createWorkbenchNodeStore([agentNode])
    const { result } = renderHook(() =>
      useAgentLayoutCoordination({
        clearTerminalGroupDropPreview: vi.fn(),
        currentProjectId: 'project-1',
        currentWorkspaceId: 'main',
        moveWorkbenchNode: vi.fn(async () => undefined),
        moveWorkspaceAgent: vi.fn(async () => undefined),
        nodeStore,
        reactFlowInstanceRef: { current: null },
        setCurrentGraph: (nextGraph) => {
          nodeStore.setNodes([agentNode, ...createTerminalNodes(nextGraph)])
        }
      })
    )

    act(() => result.current.onAgentGraphUpdated(createEvent(graph, ['terminal-api'])))

    expect(findNode(nodeStore, 'terminal-api').position).toEqual(graph.blocks[0]!.position)
    expect(result.current.terminalWorkflowBuildPresentation).toBeNull()
  })

  function runAnimationFrame(timestamp: number): void {
    const callbacks = [...animationFrames.values()]
    animationFrames.clear()
    act(() => callbacks.forEach((callback) => callback(timestamp)))
  }
})

function createEvent(
  graph: BlockGraphSnapshot,
  createdBlockIds: readonly string[]
): AgentGraphUpdatedEvent {
  const createdBlockIdSet = new Set(createdBlockIds)
  return {
    agentId: 'agent-1',
    change: {
      blockIds: createdBlockIds,
      connectionIds: (graph.connections ?? [])
        .filter(
          (connection) =>
            createdBlockIdSet.has(connection.sourceBlockId) ||
            createdBlockIdSet.has(connection.targetBlockId)
        )
        .map((connection) => connection.id),
      kind: 'terminal_workflow_created',
      operationId: `operation-${createdBlockIds.at(-1)}`,
      terminalGroupIds: []
    },
    graph,
    projectDirectory: '/repo/app',
    sessionId: 'session-1',
    workspaceId: 'main'
  }
}

function createGraph(blockIds: readonly string[]): BlockGraphSnapshot {
  return {
    blocks: blockIds.map((id, index) => ({
      description: '',
      id,
      launchCommand: `pnpm ${id}`,
      name: id,
      position: { x: 900 + index * 500, y: 180 },
      size: { height: 300, width: 420 },
      type: 'terminal' as const
    })),
    connections:
      blockIds.includes('terminal-api') && blockIds.includes('terminal-web')
        ? [
            {
              id: 'connection-api-web',
              sourceBlockId: 'terminal-api',
              targetBlockId: 'terminal-web'
            }
          ]
        : [],
    id: 'graph-1',
    projectId: 'project-1',
    terminalGroups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    workspaceId: 'main'
  }
}

function createAgentNode(): WorkbenchFlowNode {
  const agent = {
    agentId: 'agent-1',
    cleancodeMcpEnabled: true,
    layout: { position: { x: 40, y: 80 }, size: { height: 480, width: 520 } },
    name: 'Agent 1',
    projectId: 'project-1',
    providerId: 'codex',
    workspaceId: 'main'
  }
  return {
    data: { agent },
    id: 'agent:agent-1',
    position: agent.layout.position,
    style: agent.layout.size,
    type: 'agentConsole'
  } as WorkbenchFlowNode
}

function createTerminalNodes(graph: BlockGraphSnapshot): WorkbenchFlowNode[] {
  return graph.blocks.map(
    (block) =>
      ({
        data: { block },
        id: block.id,
        position: block.position,
        style: block.size,
        type: 'terminal'
      }) as WorkbenchFlowNode
  )
}

function findNode(nodeStore: ReturnType<typeof createWorkbenchNodeStore>, nodeId: string) {
  const node = nodeStore.getNodes().find((candidate) => candidate.id === nodeId)
  if (!node) throw new Error(`Expected node ${nodeId}.`)
  return node
}
