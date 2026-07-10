import {
  getTerminalMiniMapNodeClassName,
  getTerminalMiniMapNodeStrokeColor
} from '../../../src/presentation/app-shell/terminalMinimapAppearance'
import { getTerminalStatusColor } from '../../../src/presentation/app-shell/minimapInteraction'
import {
  createIdleTerminalState,
  type TerminalFlowNode
} from '../../../src/presentation/app-shell/types'

describe('terminal minimap appearance', () => {
  it('uses a neutral node border for unselected running terminals', () => {
    const node = createTerminalNode({ selected: false })

    expect(
      getTerminalMiniMapNodeStrokeColor({
        node,
        terminalStates: {
          'terminal-1': { sessionId: 'session-1', status: 'running', output: '' }
        },
        selectedTerminalBlockId: null,
        hoveredTerminalBlockId: null
      })
    ).toBe('var(--cc-border-strong)')
    expect(
      getTerminalMiniMapNodeClassName({
        node,
        terminalStates: {
          'terminal-1': { sessionId: 'session-1', status: 'running', output: '' }
        },
        selectedTerminalBlockId: null,
        hoveredTerminalBlockId: null
      })
    ).not.toContain('canvas-minimap__node--selected')
  })

  it('uses an accent border only for selected or hovered terminals', () => {
    const node = createTerminalNode({ selected: false })

    expect(
      getTerminalMiniMapNodeStrokeColor({
        node: createTerminalNode({ selected: true }),
        terminalStates: {},
        selectedTerminalBlockId: null,
        hoveredTerminalBlockId: null
      })
    ).toBe('var(--cc-primary)')
    expect(
      getTerminalMiniMapNodeStrokeColor({
        node,
        terminalStates: {},
        selectedTerminalBlockId: null,
        hoveredTerminalBlockId: 'terminal-1'
      })
    ).toBe('var(--cc-primary)')
  })

  it('reserves semantic colors for terminal run states', () => {
    expect(getTerminalStatusColor('running')).toBe('var(--cc-success)')
    expect(getTerminalStatusColor('failed')).toBe('var(--cc-danger)')
  })
})

function createTerminalNode(input: { readonly selected: boolean }): TerminalFlowNode {
  return {
    id: 'terminal-1',
    type: 'terminal',
    position: { x: 160, y: 220 },
    selected: input.selected,
    data: {
      block: {
        id: 'terminal-1',
        type: 'terminal',
        name: 'Terminal 1',
        description: '本地终端',
        launchCommand: '',
        position: { x: 160, y: 220 },
        size: { width: 420, height: 306 }
      },
      session: createIdleTerminalState(),
      isSelected: input.selected,
      isTerminalGroupSelectionMode: false,
      canSelectForTerminalGroup: true,
      isNavigationHighlighted: false,
      onStart: vi.fn(),
      onStop: vi.fn(),
      onQuickLaunch: vi.fn(),
      onRestart: vi.fn(),
      onDelete: vi.fn(),
      onUpdateMetadata: vi.fn(),
      onInput: vi.fn(),
      onResize: vi.fn(),
      onResizeBlock: vi.fn(),
      onToggleTerminalGroupCandidate: vi.fn()
    }
  } as TerminalFlowNode
}
