import {
  getTerminalMiniMapNodeColor,
  getTerminalMiniMapNodeClassName,
  getTerminalMiniMapNodeStrokeColor
} from '../../../src/presentation/app-shell/terminalMinimapAppearance'
import { getTerminalStatusColor } from '../../../src/presentation/app-shell/minimapInteraction'
import { createIdleTerminalState } from '../../../src/contexts/run/presentation/view-models/TerminalPresentationTypes'
import type {
  AgentConsoleFlowNode,
  TerminalFlowNode
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

  it('keeps the Agent minimap node neutral without a terminal run-state class', () => {
    const node = createAgentConsoleNode()

    expect(getTerminalMiniMapNodeColor(node, {})).toBe('var(--cc-muted)')
    expect(
      getTerminalMiniMapNodeClassName({
        node,
        terminalStates: {},
        selectedTerminalBlockId: null,
        hoveredTerminalBlockId: null
      })
    ).toBe('canvas-minimap__node canvas-minimap__node--agent-console')
  })
})

function createAgentConsoleNode(): AgentConsoleFlowNode {
  return {
    id: 'agent:agent-1',
    type: 'agentConsole',
    position: { x: 540, y: 120 },
    selected: false,
    style: { width: 440, height: 520 },
    data: {
      identity: {
        projectId: 'project-1',
        workspaceId: 'main',
        objectKind: 'agent',
        objectId: 'agent-1'
      },
      agent: {
        agentId: 'agent-1',
        cleancodeMcpEnabled: true,
        layout: { position: { x: 540, y: 120 }, size: { width: 440, height: 520 } },
        name: 'Agent 1',
        projectId: 'project-1',
        providerId: 'codex',
        workspaceId: 'main'
      },
      currentWorkbench: null,
      currentWorkspace: null,
      onGraphUpdated: vi.fn(),
      onMcpCapabilityChange: vi.fn(async () => undefined),
      onRemove: vi.fn(async () => undefined),
      onRename: vi.fn(async () => undefined),
      onResize: vi.fn(async () => undefined)
    }
  }
}

function createTerminalNode(input: { readonly selected: boolean }): TerminalFlowNode {
  return {
    id: 'terminal-1',
    type: 'terminal',
    position: { x: 160, y: 220 },
    selected: input.selected,
    data: {
      identity: {
        projectId: 'project-1',
        workspaceId: 'main',
        objectKind: 'terminal',
        objectId: 'terminal-1'
      },
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
      onUpdateDefinition: vi.fn(),
      onInput: vi.fn(),
      onResize: vi.fn(),
      onResizeBlock: vi.fn(),
      onToggleTerminalGroupCandidate: vi.fn()
    }
  } as TerminalFlowNode
}
