import { render, waitFor } from '@testing-library/react'
import type { CSSProperties, ReactNode } from 'react'

import { AgentNode } from '../../../src/presentation/app-shell/workbench/nodes/agent/AgentNode'
import { TerminalNode } from '../../../src/presentation/app-shell/workbench/nodes/terminal/TerminalNode'
import type { AgentConsoleFlowNode } from '../../../src/presentation/app-shell/types/agentConsoleFlowNode'
import type { TerminalFlowNode } from '../../../src/presentation/app-shell/types/terminalFlowNode'

vi.mock('@xyflow/react', () => ({
  Handle: ({ className }: { readonly className?: string }) => <span className={className} />,
  NodeResizeControl: ({ className, style }: ResizeControlProps) => (
    <span className={className} style={style} />
  ),
  Position: { Left: 'left', Right: 'right' }
}))

interface ResizeControlProps {
  readonly children?: ReactNode
  readonly className?: string
  readonly style?: CSSProperties
}

vi.mock('../../../src/presentation/app-shell/workbench/nodes/agent/AgentConsole', () => ({
  AgentConsole: () => <div data-testid="agent-console" />
}))

vi.mock(
  '../../../src/presentation/app-shell/workbench/nodes/terminal/TerminalViewport',
  async () => {
    const React = await import('react')
    return {
      TerminalViewport: ({
        onDimensionsChange
      }: {
        readonly onDimensionsChange: (dimensions: { columns: number; rows: number }) => void
      }) => {
        React.useEffect(() => {
          onDimensionsChange({ columns: 80, rows: 24 })
        }, [onDimensionsChange])
        return <div data-testid="terminal-viewport" />
      }
    }
  }
)

describe('workbench object node presence', () => {
  it('scales the complete terminal shell and suppresses auto-start while deleting', async () => {
    const onStart = vi.fn()
    const { container } = render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={createTerminalNodeData(onStart)}
        dragging={false}
        zIndex={0}
        selectable={false}
        deletable
        selected={false}
        draggable={false}
        isConnectable={false}
        positionAbsoluteX={100}
        positionAbsoluteY={120}
      />
    )

    const anchor = container.querySelector('.terminal-node-anchor')
    const surface = container.querySelector('.terminal-node')

    expect(anchor).toHaveClass(
      'workbench-object-motion--delete',
      'workbench-object-motion--spatial'
    )
    expect(anchor).toHaveAttribute('aria-hidden', 'true')
    expect(anchor).toHaveAttribute('inert')
    expect(surface).not.toHaveClass('workbench-object-motion--delete')
    await waitFor(() => expect(onStart).not.toHaveBeenCalled())
  })

  it('makes a deleting Agent presentation inert until its center collapse completes', () => {
    const { container } = render(
      <AgentNode
        id="agent-1"
        type="agentConsole"
        data={createAgentNodeData()}
        dragging={false}
        zIndex={0}
        selectable={false}
        deletable
        selected={false}
        draggable={false}
        isConnectable={false}
        positionAbsoluteX={240}
        positionAbsoluteY={180}
      />
    )
    const surface = container.querySelector('.agent-console-node')

    expect(surface).toHaveClass(
      'workbench-object-motion--delete',
      'workbench-object-motion--spatial'
    )
    expect(surface).toHaveAttribute('aria-hidden', 'true')
    expect(surface).toHaveAttribute('inert')
  })

  it('scales a disclosing group member on its visual surface without moving handles or resize controls', () => {
    const { container } = render(
      <TerminalNode
        id="terminal-1"
        type="terminal"
        data={{
          ...createTerminalNodeData(vi.fn()),
          objectMotion: {
            id: 'group-expand:terminal-1',
            kind: 'group-expand',
            offset: { x: -320, y: -170 },
            scale: { from: 0.88, to: 1 }
          }
        }}
        dragging={false}
        zIndex={0}
        selectable={false}
        deletable
        selected={false}
        draggable={false}
        isConnectable={false}
        positionAbsoluteX={420}
        positionAbsoluteY={270}
      />
    )

    const anchor = container.querySelector('.terminal-node-anchor')
    const surface = container.querySelector('.terminal-node')

    expect(surface).toHaveClass(
      'workbench-object-motion--group-expand',
      'workbench-object-motion--spatial'
    )
    expect(anchor).not.toHaveClass('workbench-object-motion--group-expand')
    expect(anchor?.querySelector('.terminal-node__handle')).not.toBeNull()
    expect(anchor?.querySelector('.terminal-node__resize-handle')).not.toBeNull()
  })
})

function createTerminalNodeData(onStart: () => void): TerminalFlowNode['data'] {
  return {
    identity: {
      projectId: 'project-1',
      workspaceId: 'main',
      objectKind: 'terminal',
      objectId: 'terminal-1'
    },
    block: {
      id: 'terminal-1',
      name: 'Terminal 1',
      description: '',
      launchCommand: '',
      position: { x: 100, y: 120 },
      size: { width: 640, height: 420 }
    } as TerminalFlowNode['data']['block'],
    session: {
      sessionId: null,
      status: 'idle',
      output: ''
    },
    isSelected: true,
    isTerminalGroupSelectionMode: false,
    canSelectForTerminalGroup: true,
    isNavigationHighlighted: false,
    objectMotion: {
      id: 'delete:terminal-1',
      kind: 'delete',
      offset: { x: 0, y: 0 },
      scale: { from: 1, to: 0 }
    },
    onStart,
    onStop: vi.fn(),
    onQuickLaunch: vi.fn(),
    onRestart: vi.fn(),
    onDelete: vi.fn(),
    onUpdateDefinition: vi.fn(async () => undefined),
    onInput: vi.fn(),
    onResize: vi.fn(),
    onResizeBlock: vi.fn(async () => undefined),
    onToggleTerminalGroupCandidate: vi.fn()
  }
}

function createAgentNodeData(): AgentConsoleFlowNode['data'] {
  return {
    identity: {
      projectId: 'project-1',
      workspaceId: 'main',
      objectKind: 'agent',
      objectId: 'agent-1'
    },
    agent: {
      agentId: 'agent-1',
      cleancodeMcpEnabled: true,
      layout: {
        position: { x: 240, y: 180 },
        size: { width: 720, height: 460 }
      },
      name: 'Agent 1',
      projectId: 'project-1',
      providerId: 'codex',
      workspaceId: 'main'
    },
    currentWorkbench: null,
    currentWorkspace: null,
    objectMotion: {
      id: 'delete:agent:agent-1',
      kind: 'delete',
      offset: { x: 0, y: 0 },
      scale: { from: 1, to: 0 }
    },
    onGraphUpdated: vi.fn(),
    onMcpCapabilityChange: vi.fn(async () => undefined),
    onRemove: vi.fn(async () => undefined),
    onRename: vi.fn(async () => undefined),
    onResize: vi.fn(async () => undefined)
  }
}
