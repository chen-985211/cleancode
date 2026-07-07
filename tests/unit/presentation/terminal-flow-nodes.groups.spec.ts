import type {
  BlockGraphSnapshot,
  TerminalBlockSnapshot
} from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  createIdleTerminalState,
  type TerminalViewState
} from '../../../src/presentation/app-shell/types'
import { createTerminalFlowNodes } from '../../../src/presentation/app-shell/terminalFlowNodes'

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
      position: { x: 288, y: 164 },
      style: { width: 984, height: 458 },
      data: {
        selectedMemberBlockIds: ['backend-terminal']
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
    expect(nodes[0]).toMatchObject({
      id: 'development-group',
      type: 'terminalGroup',
      style: { width: 360, height: 174 }
    })
  })

  it('grows collapsed terminal groups to keep member labels inside the node', () => {
    const nodes = createTerminalFlowNodes({
      graph: createGraph({ isCollapsed: true, includeWorker: true }),
      selectedTerminalBlockIds: [],
      selectedTerminalGroupId: 'development-group',
      hoveredTerminalBlockId: null,
      terminalStates: createTerminalStates(),
      handlers: createHandlers()
    })

    expect(nodes[0]).toMatchObject({
      id: 'development-group',
      type: 'terminalGroup',
      style: { width: 360, height: 212 }
    })
  })

  it('marks ungrouped terminal nodes as selectable while composing a new group', () => {
    const graph = createGraph({ isCollapsed: false })
    const nodes = createTerminalFlowNodes({
      graph: { ...graph, terminalGroups: [] },
      selectedTerminalBlockIds: ['backend-terminal'],
      hoveredTerminalBlockId: null,
      isTerminalGroupSelectionMode: true,
      terminalStates: createTerminalStates(),
      handlers: createHandlers()
    })

    expect(nodes[0]).toMatchObject({
      type: 'terminal',
      data: {
        isSelected: true,
        isTerminalGroupSelectionMode: true,
        canSelectForTerminalGroup: true
      }
    })
  })
})

function createGraph(input: {
  readonly isCollapsed: boolean
  readonly includeWorker?: boolean
}): BlockGraphSnapshot {
  const memberBlockIds = input.includeWorker
    ? ['backend-terminal', 'frontend-terminal', 'worker-terminal']
    : ['backend-terminal', 'frontend-terminal']
  const blocks: TerminalBlockSnapshot[] = [
    {
      id: 'backend-terminal',
      type: 'terminal',
      name: 'Backend',
      description: 'Runs the API server.',
      position: { x: 320, y: 240 },
      size: { width: 420, height: 306 }
    },
    {
      id: 'frontend-terminal',
      type: 'terminal',
      name: 'Frontend',
      description: 'Runs the web server.',
      position: { x: 820, y: 240 },
      size: { width: 420, height: 306 }
    },
    {
      id: 'worker-terminal',
      type: 'terminal',
      name: 'Worker',
      description: 'Runs background jobs.',
      position: { x: 1320, y: 240 },
      size: { width: 420, height: 306 }
    }
  ]

  return {
    id: 'graph-1',
    projectId: 'project-1',
    workspaceName: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    blocks: blocks.filter((block) => memberBlockIds.includes(block.id)),
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
    onRestart: vi.fn(),
    onDelete: vi.fn(),
    onUpdateMetadata: vi.fn(),
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
