import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { TerminalViewState } from '../../../src/contexts/run/presentation/view-models/TerminalPresentationTypes'
import { createAgentConsoleFlowNode } from '../../../src/presentation/app-shell/agentConsoleFlowNode'
import { createTerminalFlowNodes } from '../../../src/presentation/app-shell/terminalFlowNodes'
import { createTerminalStateStore } from '../../../src/contexts/run/presentation/view-models/terminalStateStore'
import type { WorkbenchFlowNode } from '../../../src/presentation/app-shell/types'
import { reconcileWorkbenchNodeProjection } from '../../../src/presentation/app-shell/workbenchNodeProjectionReconciler'

describe('Workbench node projection reconciler', () => {
  it('returns the current array when every node projection is equivalent', () => {
    const store = createTerminalStateStore(terminalStates)
    const current = createNodes(createGraph(), store)
    const next = createNodes(cloneGraph(createGraph()), store)

    const reconciled = reconcileWorkbenchNodeProjection(next, current)

    expect(reconciled).toBe(current)
    expect(reconciled.every((node, index) => node === current[index])).toBe(true)
  })

  it('replaces only the node whose graph fact changed', () => {
    const store = createTerminalStateStore(terminalStates)
    const current = createNodes(createGraph(), store)
    const clonedGraph = cloneGraph(createGraph())
    const changedGraph = {
      ...clonedGraph,
      blocks: clonedGraph.blocks.map((block) =>
        block.id === 'terminal-2' ? { ...block, name: 'Renamed terminal' } : block
      )
    }
    const next = createNodes(changedGraph, store)

    const reconciled = reconcileWorkbenchNodeProjection(next, current)

    expect(referenceChanges(reconciled, current)).toEqual(['terminal-2'])
    expect(reconciled.find((node) => node.id === 'terminal-2')?.data).toMatchObject({
      block: { name: 'Renamed terminal' }
    })
  })

  it('treats selection and motion as node-local presentation dimensions', () => {
    const store = createTerminalStateStore(terminalStates)
    const current = createNodes(createGraph(), store)
    const next = createNodes(createGraph(), store).map((node): WorkbenchFlowNode => {
      if (node.id !== 'terminal-1' || node.type !== 'terminal') return node
      return {
        ...node,
        selected: true,
        data: {
          ...node.data,
          isSelected: true,
          objectMotion: {
            id: 'motion-1',
            kind: 'create',
            offset: { x: 0, y: 0 }
          }
        }
      }
    })

    const reconciled = reconcileWorkbenchNodeProjection(next, current)

    expect(referenceChanges(reconciled, current)).toEqual(['terminal-1'])
  })

  it('keeps unchanged terminal, combination, and Agent references in a dense projection', () => {
    const store = createTerminalStateStore(terminalStates)
    const current = createDenseNodeMatrix(320, store)
    const next = current.map((node): WorkbenchFlowNode => {
      if (node.id !== 'terminal-173' || node.type !== 'terminal') {
        return cloneNodeProjection(node)
      }
      return {
        ...cloneNodeProjection(node),
        data: { ...node.data, isNavigationHighlighted: true }
      } as WorkbenchFlowNode
    })

    const reconciled = reconcileWorkbenchNodeProjection(next, current)

    expect(referenceChanges(reconciled, current)).toEqual(['terminal-173'])
  })

  it('replaces only the Agent whose own snapshot changed', () => {
    const store = createTerminalStateStore(terminalStates)
    const current = createDenseNodeMatrix(24, store)
    const next = current.map((node): WorkbenchFlowNode => {
      if (node.type !== 'agentConsole') return cloneNodeProjection(node)
      return {
        ...cloneNodeProjection(node),
        data: {
          ...node.data,
          agent: { ...node.data.agent, name: 'Renamed Agent' }
        }
      } as WorkbenchFlowNode
    })

    const reconciled = reconcileWorkbenchNodeProjection(next, current)

    expect(referenceChanges(reconciled, current)).toEqual(['agent:agent-1'])
  })
})

function createNodes(
  graph: BlockGraphSnapshot,
  terminalStateStore: ReturnType<typeof createTerminalStateStore>
): WorkbenchFlowNode[] {
  return createTerminalFlowNodes({
    graph,
    handlers: terminalHandlers,
    hoveredTerminalBlockId: null,
    includeCollapsedMembers: true,
    terminalStateStore,
    terminalStates
  })
}

function createGraph(): BlockGraphSnapshot {
  return {
    blocks: [
      createBlock('terminal-1', 40),
      createBlock('terminal-2', 520),
      createBlock('terminal-3', 1_000)
    ],
    connections: [],
    id: 'graph-1',
    projectId: 'project-1',
    quickExecutionSlots: [],
    terminalGroups: [
      {
        id: 'group-1',
        isCollapsed: true,
        memberBlockIds: ['terminal-1'],
        name: 'Group 1',
        position: { x: 20, y: 20 },
        size: { height: 460, width: 460 },
        type: 'terminal-group'
      }
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
    workspaceId: 'workspace-1'
  }
}

function createBlock(id: string, x: number): BlockGraphSnapshot['blocks'][number] {
  return {
    description: '',
    id,
    launchCommand: '',
    name: id,
    position: { x, y: 80 },
    size: { height: 320, width: 440 },
    type: 'terminal'
  }
}

function cloneGraph(graph: BlockGraphSnapshot): BlockGraphSnapshot {
  return {
    ...graph,
    blocks: graph.blocks.map((block) => ({
      ...block,
      position: { ...block.position },
      size: { ...block.size }
    })),
    terminalGroups: graph.terminalGroups.map((group) => ({
      ...group,
      memberBlockIds: [...group.memberBlockIds],
      position: { ...group.position },
      size: { ...group.size }
    })),
    viewport: { ...graph.viewport }
  }
}

function createDenseNodeMatrix(
  count: number,
  terminalStateStore: ReturnType<typeof createTerminalStateStore>
): WorkbenchFlowNode[] {
  const graph = createGraph()
  const terminalNodes = createTerminalFlowNodes({
    graph: {
      ...graph,
      blocks: Array.from({ length: count }, (_, index) =>
        createBlock(`terminal-${index + 1}`, index * 460)
      ),
      terminalGroups: []
    },
    handlers: terminalHandlers,
    hoveredTerminalBlockId: null,
    terminalStateStore,
    terminalStates: {}
  })
  const groupNode = createNodes(graph, terminalStateStore).find(
    (node) => node.type === 'terminalGroup'
  )!
  const agentNode = createAgentConsoleFlowNode({
    agent: {
      agentId: 'agent-1',
      cleancodeMcpEnabled: true,
      layout: { position: { x: 40, y: 560 }, size: { height: 480, width: 560 } },
      name: 'Agent 1',
      projectId: graph.projectId,
      providerId: 'provider',
      workspaceId: graph.workspaceId
    },
    currentWorkbench: null,
    currentWorkspace: null,
    isSelected: false,
    onGraphUpdated: vi.fn(),
    onMcpCapabilityChange: vi.fn(async () => undefined),
    onRemove: vi.fn(async () => undefined),
    onRename: vi.fn(async () => undefined),
    onResize: vi.fn(async () => undefined),
    onSelect: vi.fn()
  })
  return [...terminalNodes, groupNode, agentNode]
}

function cloneNodeProjection(node: WorkbenchFlowNode): WorkbenchFlowNode {
  return {
    ...node,
    data: { ...node.data },
    position: { ...node.position },
    style: node.style ? { ...node.style } : node.style
  } as WorkbenchFlowNode
}

function referenceChanges(
  next: readonly WorkbenchFlowNode[],
  current: readonly WorkbenchFlowNode[]
): string[] {
  const currentById = new Map(current.map((node) => [node.id, node]))
  return next.filter((node) => node !== currentById.get(node.id)).map((node) => node.id)
}

const terminalStates: Record<string, TerminalViewState> = {
  'terminal-1': { output: '', sessionId: 'session-1', status: 'running' },
  'terminal-2': { output: '', sessionId: null, status: 'idle' },
  'terminal-3': { output: '', sessionId: null, status: 'idle' }
}

const terminalHandlers = {
  onDelete: vi.fn(),
  onInput: vi.fn(),
  onQuickLaunch: vi.fn(),
  onResize: vi.fn(),
  onResizeBlock: vi.fn(async () => undefined),
  onRestart: vi.fn(),
  onStart: vi.fn(),
  onStop: vi.fn(),
  onToggleTerminalGroupCandidate: vi.fn(),
  onUpdateDefinition: vi.fn(async () => undefined)
}
