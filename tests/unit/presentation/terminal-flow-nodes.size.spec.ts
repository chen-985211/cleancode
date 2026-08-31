import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  createIdleTerminalState,
  type TerminalViewState
} from '../../../src/contexts/run/presentation/view-models/TerminalPresentationTypes'
import { createTerminalFlowNodes } from '../../../src/presentation/app-shell/terminalFlowNodes'

describe('terminal flow nodes', () => {
  it('uses the terminal block size as the React Flow node dimensions', () => {
    const graph = createGraph()

    const nodes = createTerminalFlowNodes({
      graph,
      selectedTerminalBlockId: 'terminal-1',
      hoveredTerminalBlockId: null,
      terminalStates: createTerminalStates(),
      handlers: createHandlers()
    })

    expect(nodes[0]).toMatchObject({
      id: 'terminal-1',
      position: { x: 180, y: 270 },
      style: { width: 760, height: 420 },
      data: {
        block: expect.objectContaining({
          size: { width: 760, height: 420 }
        })
      }
    })
  })

  it('projects the active workflow root and scoped stop action onto its terminal node', () => {
    const onStopWorkflow = vi.fn()
    const nodes = createTerminalFlowNodes({
      graph: createGraph(),
      activeWorkflowRunIdByRootBlockId: { 'terminal-1': 'run-1' },
      stoppingWorkflowRunIds: ['run-1'],
      hoveredTerminalBlockId: null,
      terminalStates: createTerminalStates(),
      handlers: { ...createHandlers(), onStopWorkflow }
    })

    const node = nodes[0]
    expect(node?.data).toMatchObject({
      isActiveWorkflowRoot: true,
      isStoppingWorkflow: true
    })
    if (node?.type !== 'terminal') throw new Error('Expected a terminal node.')
    node.data.onStopWorkflow?.()
    expect(onStopWorkflow).toHaveBeenCalledWith('run-1')
  })
})

function createGraph(): BlockGraphSnapshot {
  return {
    id: 'graph-1',
    projectId: 'project-1',
    workspaceId: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    terminalGroups: [],
    blocks: [
      {
        id: 'terminal-1',
        type: 'terminal',
        name: 'Terminal 1',
        description: '本地终端',
        launchCommand: '',
        position: { x: 180, y: 270 },
        size: { width: 760, height: 420 }
      }
    ]
  }
}

function createTerminalStates(): Record<string, TerminalViewState> {
  return { 'terminal-1': createIdleTerminalState() }
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
    onToggleTerminalGroupCandidate: vi.fn()
  }
}
