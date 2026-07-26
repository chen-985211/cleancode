import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { AgentToolApprovalRequest } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import {
  createAgentSessionSnapshot,
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

vi.mock('@xterm/xterm', () => ({
  Terminal: class FakeTerminal {
    cols = 88
    rows = 24
    options = {}
    readonly attachCustomKeyEventHandler = vi.fn()
    readonly dispose = vi.fn()
    readonly getSelection = vi.fn(() => '')
    readonly hasSelection = vi.fn(() => false)
    readonly loadAddon = vi.fn()
    readonly onData = vi.fn(() => ({ dispose: vi.fn() }))
    readonly onResize = vi.fn(() => ({ dispose: vi.fn() }))
    readonly open = vi.fn()
    readonly reset = vi.fn()
    readonly write = vi.fn()
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class FakeFitAddon {
    readonly fit = vi.fn()
  }
}))

describe('Agent destructive approval canvas', () => {
  let originalResizeObserver: typeof ResizeObserver | undefined

  beforeEach(() => {
    originalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  })

  afterEach(() => {
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
    } else {
      Reflect.deleteProperty(globalThis, 'ResizeObserver')
    }
    Object.defineProperty(window, 'cleancode', { configurable: true, value: undefined })
  })

  it('connects the Agent to the exact target and exposes approve or retain actions', async () => {
    const baseWorkbench = createWorkbenchSnapshot('/repo/app', 'app')
    const workbench = {
      ...baseWorkbench,
      agents: [
        {
          agentId: 'agent-1',
          cleancodeMcpEnabled: true,
          layout: { position: { x: 540, y: 120 }, size: { height: 520, width: 720 } },
          name: 'Agent 1',
          projectId: baseWorkbench.project.id,
          providerId: 'codex',
          workspaceId: 'main'
        }
      ],
      graph: {
        ...baseWorkbench.graph,
        blocks: [
          {
            description: 'FastAPI 开发服务器',
            id: 'terminal-1',
            launchCommand: 'pnpm dev:api',
            name: 'Backend API',
            position: { x: 80, y: 80 },
            size: { height: 260, width: 420 },
            type: 'terminal' as const
          },
          {
            description: '管理后台',
            id: 'terminal-2',
            launchCommand: 'pnpm dev:web',
            name: 'Admin Web',
            position: { x: 540, y: 80 },
            size: { height: 260, width: 420 },
            type: 'terminal' as const
          }
        ],
        terminalGroups: [
          {
            id: 'group-1',
            isCollapsed: false,
            memberBlockIds: ['terminal-1', 'terminal-2'],
            name: '启动项目',
            position: { x: 60, y: 60 },
            size: { height: 320, width: 920 },
            type: 'terminal-group' as const
          }
        ]
      }
    }
    let approvalListener: ((event: AgentToolApprovalRequest) => void) | null = null
    const approveAgentTool = vi.fn(async () => ({ graph: workbench.graph, status: 'completed' }))
    const rejectAgentTool = vi.fn(async () => undefined)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        approveAgentTool,
        attachAgentSession: vi.fn(async (command) =>
          createAgentSessionSnapshot({
            agentId: command.agentId,
            gitBranch: command.gitBranch ?? null,
            projectDirectory: '/repo/app',
            projectId: command.projectId,
            providerId: 'codex',
            sessionId: 'agent-session-1',
            terminalSourceTheme: command.terminalSourceTheme,
            workspaceDirectory: '/repo/app',
            workspaceId: 'main'
          })
        ),
        inspectCodexCli: vi.fn(async () => ({
          status: 'installed',
          version: 'codex-cli 0.143.0'
        })),
        listWorkbenches: vi.fn(async () => [workbench]),
        onAgentToolApprovalRequested: vi.fn((listener) => {
          approvalListener = listener
          return vi.fn()
        }),
        rejectAgentTool
      })
    })

    render(<AppShell />)

    await waitFor(() => expect(window.cleancode?.attachAgentSession).toHaveBeenCalled())
    expect(approvalListener).toBeTruthy()
    expect(document.querySelector('.agent-approval-intent-handle--source')).toHaveAttribute(
      'data-handleid',
      'agent-approval-source'
    )
    expect(document.querySelectorAll('.agent-approval-intent-handle--target')).toHaveLength(3)
    for (const targetHandle of document.querySelectorAll('.agent-approval-intent-handle--target')) {
      expect(targetHandle).toHaveAttribute('data-handleid', 'agent-approval-target')
    }

    act(() => {
      approvalListener?.({
        agentId: 'agent-1',
        approvalId: 'approval-1',
        projectDirectory: '/repo/app',
        sessionId: 'agent-session-1',
        summary: '删除终端积木 terminal-1',
        target: { blockId: 'terminal-1', kind: 'terminal_block' },
        toolName: 'delete_block',
        workspaceId: 'main'
      })
    })

    await waitFor(() =>
      expect(document.querySelector('[data-agent-console-node="agent-1"]')).toHaveAttribute(
        'data-approval-state',
        'pending'
      )
    )
    expect(document.querySelector('.agent-tool-approval-card')).toBeInTheDocument()
    expect(await screen.findByText('删除终端')).toBeInTheDocument()
    expect(screen.getAllByText('Backend API')).toHaveLength(2)
    const approvalTarget = document.querySelector('[data-terminal-block-id="terminal-1"]')
    expect(approvalTarget).toHaveClass('terminal-node--approval-target')
    expect(approvalTarget?.querySelector('.agent-approval-target-chip')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('确认删除', { selector: 'button' }))
    expect(approveAgentTool).toHaveBeenCalledWith({ approvalId: 'approval-1' })

    act(() => {
      approvalListener?.({
        agentId: 'agent-1',
        approvalId: 'approval-2',
        projectDirectory: '/repo/app',
        sessionId: 'agent-session-1',
        summary: '删除组合终端 group-1',
        target: { kind: 'terminal_group', terminalGroupId: 'group-1' },
        toolName: 'delete_terminal_group',
        workspaceId: 'main'
      })
    })
    fireEvent.click(await screen.findByText('保留组合', { selector: 'button' }))
    expect(rejectAgentTool).toHaveBeenCalledWith({ approvalId: 'approval-2' })
  })
})
