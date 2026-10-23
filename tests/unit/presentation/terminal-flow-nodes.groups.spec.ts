import type {
  BlockGraphSnapshot,
  TerminalBlockSnapshot
} from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  createIdleTerminalState,
  type TerminalViewState
} from '../../../src/contexts/run/presentation/view-models/TerminalPresentationTypes'
import { createTerminalFlowNodes } from '../../../src/presentation/app-shell/projections/terminalFlowNodes'

describe('terminal flow nodes for terminal groups', () => {
  it('creates an expanded terminal group node with its member terminals visible', () => {
    const nodes = createTerminalFlowNodes({
      graph: createGraph({ isCollapsed: false }),
      selectedTerminalBlockIds: ['backend-terminal'],
      selectedTerminalGroupId: 'development-group',
      hoveredTerminalBlockId: null,
      terminalStates: createTerminalStates(),
      handlers: createHandlers()
    })

    expect(nodes.map((node) => node.id)).toEqual([
      'development-group',
      'backend-terminal',
      'frontend-terminal'
    ])
    expect(nodes[0]).toMatchObject({
      id: 'development-group',
      type: 'terminalGroup',
      selectable: false,
      position: { x: 288, y: 164 },
      style: { width: 984, height: 458 },
      data: {
        isEditing: false
      }
    })
    expect(nodes[1]).toMatchObject({
      id: 'backend-terminal',
      type: 'terminal',
      selected: true
    })
  })

  it('hides member terminal nodes when the terminal group is collapsed', () => {
    const nodes = createTerminalFlowNodes({
      graph: createGraph({ isCollapsed: true }),
      selectedTerminalBlockIds: [],
      selectedTerminalGroupId: 'development-group',
      hoveredTerminalBlockId: null,
      terminalStates: createTerminalStates(),
      handlers: createHandlers()
    })

    expect(nodes.map((node) => node.id)).toEqual(['development-group'])
    expect(nodes[0]).toMatchObject({ id: 'development-group', type: 'terminalGroup' })
  })

  it.each([false, true])(
    'keeps one complete workflow handle accessible across a folded boundary=%s',
    (isCollapsed) => {
      const base = createGraph({ isCollapsed })
      const graph = {
        ...base,
        terminalGroups: base.terminalGroups.map((group) => ({
          ...group,
          memberBlockIds: ['backend-terminal']
        })),
        connections: [
          {
            id: 'edge',
            sourceBlockId: 'backend-terminal',
            targetBlockId: 'frontend-terminal',
            trigger: 'on-success' as const
          }
        ]
      }
      const nodes = createTerminalFlowNodes({
        graph,
        handlers: createHandlers(),
        hoveredTerminalBlockId: null
      })
      const handles = nodes.filter(
        (node) => node.type === 'terminal' && node.data.workflowDragTerminalIds
      )
      expect(handles).toHaveLength(1)
      expect(handles[0]?.id).toBe(isCollapsed ? 'frontend-terminal' : 'backend-terminal')
      expect(new Set(handles[0]?.data.workflowDragTerminalIds as readonly string[])).toEqual(
        new Set(['backend-terminal', 'frontend-terminal'])
      )
    }
  )

  it('can project collapsed member templates without making them visible by default', () => {
    const nodes = createTerminalFlowNodes({
      graph: createGraph({ isCollapsed: true }),
      selectedTerminalBlockIds: [],
      selectedTerminalGroupId: 'development-group',
      hoveredTerminalBlockId: null,
      terminalStates: createTerminalStates(),
      handlers: createHandlers(),
      includeCollapsedMembers: true
    })

    expect(nodes.map((node) => node.id)).toEqual([
      'development-group',
      'backend-terminal',
      'frontend-terminal'
    ])
  })

  it.each([{ memberCount: 2 }, { memberCount: 5 }, { memberCount: 10 }])(
    'keeps a collapsed application square regardless of $memberCount members',
    ({ memberCount }) => {
      const nodes = createTerminalFlowNodes({
        graph: createGraph({ isCollapsed: true, memberCount }),
        selectedTerminalBlockIds: [],
        selectedTerminalGroupId: 'development-group',
        hoveredTerminalBlockId: null,
        terminalStates: createTerminalStates(),
        handlers: createHandlers()
      })

      expect(nodes[0]).toMatchObject({
        id: 'development-group',
        type: 'terminalGroup',
        style: { width: 112, height: 112 }
      })
    }
  )

  it('keeps the persisted terminal group dimensions when the group is expanded', () => {
    const nodes = createTerminalFlowNodes({
      graph: createGraph({ isCollapsed: false, memberCount: 10 }),
      selectedTerminalBlockIds: [],
      selectedTerminalGroupId: 'development-group',
      hoveredTerminalBlockId: null,
      terminalStates: createTerminalStates(),
      handlers: createHandlers()
    })

    expect(nodes[0]).toMatchObject({
      id: 'development-group',
      type: 'terminalGroup',
      style: { width: 984, height: 458 }
    })
  })

  it('keeps terminal selection semantics independent from group-space editing', () => {
    const graph = createGraph({ isCollapsed: false })
    const nodes = createTerminalFlowNodes({
      graph: { ...graph, terminalGroups: [] },
      selectedTerminalBlockIds: ['backend-terminal'],
      selectedTerminalGroupId: 'development-group',
      hoveredTerminalBlockId: null,
      terminalStates: createTerminalStates(),
      handlers: createHandlers()
    })

    expect(nodes[0]).toMatchObject({
      type: 'terminal',
      data: {
        isSelected: true,
        isTerminalGroupSelectionMode: false,
        canSelectForTerminalGroup: false
      }
    })
  })

  it('marks only the active container as editing', () => {
    const nodes = createTerminalFlowNodes({
      graph: createGraph({ isCollapsed: false }),
      editingTerminalGroupId: 'development-group',
      selectedTerminalBlockIds: ['backend-terminal'],
      selectedTerminalGroupId: 'development-group',
      hoveredTerminalBlockId: null,
      terminalStates: createTerminalStates(),
      handlers: createHandlers()
    })

    expect(nodes[1]).toMatchObject({
      id: 'backend-terminal',
      type: 'terminal',
      selected: true,
      data: {
        isSelected: true,
        isTerminalGroupSelectionMode: false,
        canSelectForTerminalGroup: false
      }
    })
    expect(nodes[0]).toMatchObject({
      id: 'development-group',
      type: 'terminalGroup',
      data: {
        isEditing: true
      }
    })
  })

  it('keeps group editing independent from ordinary group selection', () => {
    const nodes = createTerminalFlowNodes({
      graph: createGraph({ isCollapsed: false }),
      editingTerminalGroupId: 'development-group',
      selectedTerminalBlockIds: [],
      selectedTerminalGroupId: null,
      hoveredTerminalBlockId: null,
      terminalStates: createTerminalStates(),
      handlers: createHandlers()
    })

    expect(nodes[0]).toMatchObject({
      id: 'development-group',
      type: 'terminalGroup',
      selected: false,
      data: {
        isEditing: true,
        isSelected: false
      }
    })
  })

  it('projects build timing as generic object-presence intent', () => {
    const nodes = createTerminalFlowNodes({
      graph: createGraph({ isCollapsed: false }),
      handlers: createHandlers(),
      hoveredTerminalBlockId: null,
      terminalStates: createTerminalStates(),
      workflowBuildPresentation: {
        enteringConnectionIds: new Set(),
        enteringTerminalBlockIds: new Set(['backend-terminal']),
        enteringTerminalGroupIds: new Set(),
        operationId: 'operation-1',
        pendingConnectionIds: new Set(),
        pendingTerminalBlockIds: new Set(['frontend-terminal']),
        pendingTerminalGroupIds: new Set(['development-group']),
        terminalBlockIds: new Set(['backend-terminal', 'frontend-terminal']),
        terminalGroupIds: new Set(['development-group'])
      }
    })

    expect(nodes.find((node) => node.id === 'development-group')).toMatchObject({
      className: undefined,
      data: { objectPresence: { id: 'operation-1:development-group', phase: 'pending' } }
    })
    expect(nodes.find((node) => node.id === 'backend-terminal')).toMatchObject({
      className: undefined,
      data: { objectPresence: { id: 'operation-1:backend-terminal', phase: 'entering' } }
    })
    expect(nodes.find((node) => node.id === 'frontend-terminal')).toMatchObject({
      className: undefined,
      data: { objectPresence: { id: 'operation-1:frontend-terminal', phase: 'pending' } }
    })
  })
})

function createGraph(input: {
  readonly isCollapsed: boolean
  readonly memberCount?: number
}): BlockGraphSnapshot {
  const blocks = createTerminalBlocks(input.memberCount ?? 2)
  const memberBlockIds = blocks.map((block) => block.id)

  return {
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks,
    terminalGroups: [
      {
        id: 'development-group',
        type: 'terminal-group',
        name: '启动项目',
        position: { x: 288, y: 164 },
        size: { width: 984, height: 458 },
        isCollapsed: input.isCollapsed,
        memberBlockIds
      }
    ]
  }
}

function createTerminalBlocks(memberCount: number): TerminalBlockSnapshot[] {
  const coreBlocks: TerminalBlockSnapshot[] = [
    {
      id: 'backend-terminal',
      type: 'terminal',
      name: 'Backend',
      description: 'Runs the API server.',
      launchCommand: '',
      position: { x: 320, y: 240 },
      size: { width: 420, height: 306 }
    },
    {
      id: 'frontend-terminal',
      type: 'terminal',
      name: 'Frontend',
      description: 'Runs the web server.',
      launchCommand: '',
      position: { x: 820, y: 240 },
      size: { width: 420, height: 306 }
    }
  ]
  const additionalBlocks = Array.from(
    { length: Math.max(memberCount - coreBlocks.length, 0) },
    (_, index): TerminalBlockSnapshot => ({
      id: `worker-terminal-${index + 1}`,
      type: 'terminal',
      name: `Worker ${index + 1}`,
      description: 'Runs background jobs.',
      launchCommand: '',
      position: { x: 1320 + index * 500, y: 240 },
      size: { width: 420, height: 306 }
    })
  )

  return [...coreBlocks, ...additionalBlocks].slice(0, memberCount)
}

function createTerminalStates(): Record<string, TerminalViewState> {
  return {
    'backend-terminal': createIdleTerminalState(),
    'frontend-terminal': createIdleTerminalState()
  }
}

function createHandlers() {
  return {
    onStart: vi.fn(),
    onStop: vi.fn(),
    onQuickLaunch: vi.fn(),
    onRestart: vi.fn(),
    onDelete: vi.fn(),
    onUpdateDefinition: vi.fn(),
    onInput: vi.fn(),
    onResize: vi.fn(),
    onResizeBlock: vi.fn(async () => undefined),
    onToggleTerminalGroupCandidate: vi.fn(),
    onStartGroup: vi.fn(),
    onStopGroup: vi.fn(),
    onRestartGroup: vi.fn(),
    onUpdateGroupMetadata: vi.fn(async () => undefined),
    onToggleGroupCollapsed: vi.fn(async () => undefined),
    onAddSelectedTerminalsToGroup: vi.fn(async () => undefined),
    onRemoveSelectedTerminalsFromGroup: vi.fn(async () => undefined),
    onRemoveTerminalFromGroup: vi.fn(async () => undefined),
    onDissolveGroup: vi.fn(async () => undefined)
  }
}
