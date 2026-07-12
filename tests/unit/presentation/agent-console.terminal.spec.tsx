import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import type { AgentToolApprovalRequest } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import { AppShell } from '../../../src/presentation/app-shell/AppShell'
import { installAgentXterm } from '../../../src/presentation/app-shell/agentTerminalXterm'
import { effectiveThemeChangeEventName } from '../../../src/presentation/app-shell/themePreference'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

interface FakeAgentTerminalInstance {
  cols: number
  rows: number
  options: { theme?: Record<string, string> }
  readonly dispose: ReturnType<typeof vi.fn>
  readonly loadAddon: ReturnType<typeof vi.fn>
  readonly onData: ReturnType<typeof vi.fn>
  readonly open: ReturnType<typeof vi.fn>
  readonly reset: ReturnType<typeof vi.fn>
  readonly write: ReturnType<typeof vi.fn>
  dataListener: ((input: string) => void) | null
}

interface FakeAgentFitAddonInstance {
  terminal?: FakeAgentTerminalInstance
  readonly fit: ReturnType<typeof vi.fn>
}

const agentXtermMockState = vi.hoisted(() => ({
  terminals: [] as FakeAgentTerminalInstance[]
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class FakeTerminal implements FakeAgentTerminalInstance {
    cols = 88
    rows = 24
    options: { theme?: Record<string, string> }
    dataListener: ((input: string) => void) | null = null

    readonly dispose = vi.fn()
    readonly open = vi.fn()
    readonly reset = vi.fn()
    readonly loadAddon = vi.fn((addon: FakeAgentFitAddonInstance) => {
      addon.terminal = this
    })
    readonly onData = vi.fn((listener: (input: string) => void) => {
      this.dataListener = listener

      return { dispose: vi.fn() }
    })
    readonly write = vi.fn((output: string) => {
      if (output.includes('\u001b[6n')) {
        this.dataListener?.('\u001b[1;1R')
      }
    })

    constructor(options: { theme?: Record<string, string> }) {
      this.options = options
      agentXtermMockState.terminals.push(this)
    }
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class FakeFitAddon implements FakeAgentFitAddonInstance {
    terminal?: FakeAgentTerminalInstance

    readonly fit = vi.fn()
  }
}))

describe('agent console terminal', () => {
  let originalUserAgent: string
  let originalResizeObserver: typeof ResizeObserver | undefined

  beforeEach(() => {
    agentXtermMockState.terminals = []
    originalUserAgent = navigator.userAgent
    originalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class StubResizeObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent
    })

    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
      return
    }

    Reflect.deleteProperty(globalThis, 'ResizeObserver')
  })

  it('registers Codex terminal input before replaying buffered startup output', () => {
    const onInput = vi.fn()
    const xtermRef = { current: null }
    const dispose = installAgentXterm({
      element: document.createElement('div'),
      initialOutput: '\u001b[6n',
      onDimensionsChange: vi.fn(),
      onInput,
      xtermRef
    })

    expect(onInput).toHaveBeenCalledWith('\u001b[1;1R')

    dispose()
  })

  it('keeps one Codex terminal palette so buffered truecolor output stays coherent', () => {
    document.documentElement.dataset.theme = 'dark'
    document.documentElement.style.setProperty('--cc-terminal-background', '#10151d')
    const element = document.createElement('div')
    const dispose = installAgentXterm({
      element,
      initialOutput: '',
      onDimensionsChange: vi.fn(),
      onInput: vi.fn(),
      xtermRef: { current: null }
    })
    const terminal = agentXtermMockState.terminals[0]

    expect(terminal?.options.theme?.background).toBe('#10151d')
    expect(element).toHaveAttribute('data-agent-terminal-source-theme', 'dark')

    document.documentElement.dataset.theme = 'light'
    document.documentElement.style.setProperty('--cc-terminal-background', '#f6f8fb')
    window.dispatchEvent(new CustomEvent(effectiveThemeChangeEventName))

    expect(terminal?.options.theme?.background).toBe('#10151d')
    expect(agentXtermMockState.terminals).toHaveLength(1)

    dispose()
    expect(element).not.toHaveAttribute('data-agent-terminal-source-theme')
    document.documentElement.style.setProperty('--cc-terminal-background', '#202631')
    window.dispatchEvent(new CustomEvent(effectiveThemeChangeEventName))

    expect(terminal?.options.theme?.background).toBe('#10151d')
  })

  it('installs xterm after the current workspace appears asynchronously', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const attachAgentSession = vi.fn(async () => ({
      processId: 42,
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-1',
      status: 'running',
      workspaceDirectory: '/repo/app',
      workspaceName: 'main'
    }))

    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'cleancode desktop renderer'
    })
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        attachAgentSession,
        inspectCodexCli: vi.fn(async () => ({
          installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
          status: 'installed',
          version: 'codex-cli 0.143.0'
        })),
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })

    render(<AppShell />)

    await waitFor(() => expect(attachAgentSession).toHaveBeenCalled())
    await waitFor(() => expect(agentXtermMockState.terminals).toHaveLength(1))
    expect(agentXtermMockState.terminals[0]?.open).toHaveBeenCalled()
  })

  it('attaches a real Codex CLI PTY for the current workspace directory instead of showing a chat composer', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app', {
      workspaceDirectory: '/repo/app-worktrees/feature',
      workspaceName: 'feature'
    })
    const attachAgentSession = vi.fn(async () => ({
      processId: 42,
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-1',
      status: 'running',
      workspaceDirectory: '/repo/app-worktrees/feature',
      workspaceName: 'feature'
    }))
    const writeAgentSession = vi.fn(async () => undefined)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        attachAgentSession,
        inspectCodexCli: vi.fn(async () => ({
          installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
          status: 'installed',
          version: 'codex-cli 0.143.0'
        })),
        listWorkbenches: vi.fn(async () => [workbench]),
        writeAgentSession
      })
    })

    render(<AppShell />)

    expect(await screen.findByLabelText('Codex CLI 会话')).toBeInTheDocument()
    expect(await screen.findByLabelText('Codex CLI 终端')).toBeInTheDocument()
    expect(screen.queryByLabelText('Agent 指令')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '发送 Agent 指令' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(attachAgentSession).toHaveBeenCalledWith(
        expect.objectContaining({
          projectDirectory: '/repo/app',
          workspaceDirectory: '/repo/app-worktrees/feature',
          workspaceName: 'feature'
        })
      )
    )

    fireEvent.change(screen.getByLabelText('Codex CLI 输入'), {
      target: { value: '创建一个前端终端\n' }
    })
    expect(writeAgentSession).toHaveBeenCalledWith({
      input: '创建一个前端终端\n',
      sessionId: 'agent-session-1'
    })
  })

  it('keeps the current Agent session attached when its canvas node is selected', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const attachAgentSession = vi.fn(async () => ({
      processId: 42,
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-1',
      status: 'running',
      workspaceDirectory: '/repo/app',
      workspaceName: 'main'
    }))

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        attachAgentSession,
        listWorkbenches: vi.fn(async () => [workbench])
      })
    })

    render(<AppShell />)

    await waitFor(() => expect(attachAgentSession).toHaveBeenCalledTimes(1))
    const agentConsole = document.querySelector('[data-agent-console-node]')

    expect(agentConsole).toBeInTheDocument()
    fireEvent.click(agentConsole!)

    await waitFor(() => expect(attachAgentSession).toHaveBeenCalledTimes(1))
  })

  it('keeps separate background Codex sessions when switching workspaces', async () => {
    const mainWorkbench = createWorkbenchSnapshot('/repo/app', 'app', {
      workspaces: [
        {
          directory: '/repo/app',
          gitBranch: 'main',
          isCurrent: true,
          name: 'main'
        },
        {
          directory: '/repo/app-worktrees/feature',
          gitBranch: 'feature',
          isCurrent: false,
          name: 'feature'
        }
      ]
    })
    const featureWorkbench = {
      ...mainWorkbench,
      project: {
        ...mainWorkbench.project,
        workspaces: mainWorkbench.project.workspaces.map((workspace) => ({
          ...workspace,
          isCurrent: workspace.name === 'feature'
        }))
      },
      graph: { ...mainWorkbench.graph, workspaceName: 'feature' }
    }
    const attachAgentSession = vi
      .fn()
      .mockResolvedValueOnce({
        processId: 1,
        projectDirectory: '/repo/app',
        sessionId: 'agent-main',
        status: 'running',
        workspaceDirectory: '/repo/app',
        workspaceName: 'main'
      })
      .mockResolvedValueOnce({
        processId: 2,
        projectDirectory: '/repo/app',
        sessionId: 'agent-feature',
        status: 'running',
        workspaceDirectory: '/repo/app-worktrees/feature',
        workspaceName: 'feature'
      })
    const switchBranchWorkspace = vi.fn(async () => featureWorkbench)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        attachAgentSession,
        inspectCodexCli: vi.fn(async () => ({
          installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
          status: 'installed',
          version: 'codex-cli 0.143.0'
        })),
        listWorkbenches: vi.fn(async () => [mainWorkbench]),
        switchBranchWorkspace
      })
    })

    render(<AppShell />)

    await waitFor(() =>
      expect(attachAgentSession).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceName: 'main' })
      )
    )
    fireEvent.click(await screen.findByRole('button', { name: 'feature 独立工作区' }))

    await waitFor(() =>
      expect(attachAgentSession).toHaveBeenLastCalledWith(
        expect.objectContaining({
          workspaceDirectory: '/repo/app-worktrees/feature',
          workspaceName: 'feature'
        })
      )
    )
    expect(window.cleancode?.disposeAgentWorkspaceSession).not.toHaveBeenCalled()
  })

  it('shows destructive MCP tool approvals outside the terminal output', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    let approvalListener: ((event: AgentToolApprovalRequest) => void) | null = null
    const approveAgentTool = vi.fn(async () => undefined)
    const rejectAgentTool = vi.fn(async () => undefined)

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        approveAgentTool,
        attachAgentSession: vi.fn(async () => ({
          processId: 1,
          projectDirectory: '/repo/app',
          sessionId: 'agent-session-1',
          status: 'running',
          workspaceDirectory: '/repo/app',
          workspaceName: 'main'
        })),
        inspectCodexCli: vi.fn(async () => ({
          installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
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

    await waitFor(() => expect(approvalListener).toBeTruthy())
    ;(approvalListener as unknown as (event: AgentToolApprovalRequest) => void)({
      agentId: 'default-agent',
      approvalId: 'approval-1',
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-1',
      summary: '删除终端积木 terminal-1',
      toolName: 'delete_block',
      workspaceName: 'main'
    })

    expect(await screen.findByText('需要授权')).toBeInTheDocument()
    expect(screen.getByText('删除终端积木 terminal-1')).toBeInTheDocument()
    fireEvent.click(screen.getByText('确认删除'))
    expect(approveAgentTool).toHaveBeenCalledWith({ approvalId: 'approval-1' })

    ;(approvalListener as unknown as (event: AgentToolApprovalRequest) => void)({
      agentId: 'default-agent',
      approvalId: 'approval-2',
      projectDirectory: '/repo/app',
      sessionId: 'agent-session-1',
      summary: '删除组合终端 group-1',
      toolName: 'delete_terminal_group',
      workspaceName: 'main'
    })
    fireEvent.click(await screen.findByText('拒绝'))
    expect(rejectAgentTool).toHaveBeenCalledWith({ approvalId: 'approval-2' })
  })
})
