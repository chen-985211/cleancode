import type { BlockGraphSnapshot } from '../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'
import {
  createIdleTerminalState,
  type TerminalViewState
} from '../../../src/presentation/app-shell/types'
import { createTerminalFlowNodes } from '../../../src/presentation/app-shell/terminalFlowNodes'

describe('terminal flow nodes', () => {
  it('uses the terminal block size as the React Flow node dimensions', () => {
    const graph = {
      id: 'graph-1',
      projectId: 'project-1',
      workspaceName: 'main',
      blocks: [
        {
          id: 'terminal-1',
          type: 'terminal',
          name: 'Terminal 1',
          description: '本地终端',
          position: { x: 180, y: 270 },
          size: { width: 760, height: 420 }
        }
      ]
    } as BlockGraphSnapshot
    const terminalStates: Record<string, TerminalViewState> = {
      'terminal-1': createIdleTerminalState()
    }
    const handlers = {
      onStart: vi.fn(),
      onStop: vi.fn(),
      onRestart: vi.fn(),
      onDelete: vi.fn(),
      onUpdateMetadata: vi.fn(),
      onInput: vi.fn(),
      onResize: vi.fn(),
      onResizeBlock: vi.fn(async () => undefined)
    }

    const nodes = createTerminalFlowNodes({
      graph,
      selectedTerminalBlockId: 'terminal-1',
      hoveredTerminalBlockId: null,
      terminalStates,
      handlers
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
})
