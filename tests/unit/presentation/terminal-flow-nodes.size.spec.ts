import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  createIdleTerminalState,
  type TerminalViewState
} from '../../../src/presentation/app-shell/types'
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
      activeWorkflowRootBlockIds: ['terminal-1'],
      isStoppingWorkflow: true,
      hoveredTerminalBlockId: null,
      terminalStates: createTerminalStates(),
      handlers: { ...createHandlers(), onStopWorkflow }
    })

    expect(nodes[0]?.data).toMatchObject({
      isActiveWorkflowRoot: true,
      isStoppingWorkflow: true,
      onStopWorkflow
    })
  })
})

function createGraph(): BlockGraphSnapshot {
  return {
    id: 'graph-1',
    projectId: 'project-1',
    workspaceName: 'main',
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
    onUpdateMetadata: vi.fn(),
    onInput: vi.fn(),
    onResize: vi.fn(),
    onResizeBlock: vi.fn(async () => undefined),
    onToggleTerminalGroupCandidate: vi.fn()
  }
}
