import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AgentConsole } from '../../../src/presentation/app-shell/AgentConsole'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('agent console Codex status', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: undefined
    })
  })

  it('keeps the ready state quiet without redundant installation or connection labels', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const currentWorkspace = workbench.project.workspaces[0]!

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        inspectCodexCli: vi.fn(async () => ({
          installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
          status: 'installed',
          version: 'codex-cli 0.143.0'
        }))
      })
    })

    render(<AgentConsole currentWorkbench={workbench} currentWorkspace={currentWorkspace} />)

    await waitFor(() => expect(window.cleancode?.attachAgentSession).toHaveBeenCalled())
    expect(screen.queryByText('已安装')).not.toBeInTheDocument()
    expect(screen.queryByText('已连接')).not.toBeInTheDocument()
    expect(screen.queryByText('codex-cli 0.143.0')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows a quick install command when Codex CLI is missing', async () => {
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        inspectCodexCli: vi.fn(async () => ({
          installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
          status: 'missing',
          version: null
        }))
      })
    })

    render(<AgentConsole />)

    expect(await screen.findByText('未检测到 Codex CLI')).toBeInTheDocument()
    expect(screen.queryByText('未安装')).not.toBeInTheDocument()
    expect(
      screen.getByText('curl -fsSL https://chatgpt.com/codex/install.sh | sh')
    ).toBeInTheDocument()
  })

  it('surfaces a failed session as the single actionable status', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const currentWorkspace = workbench.project.workspaces[0]!

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        attachAgentSession: vi.fn(async (command) => ({
          agentId: command.agentId,
          codexThreadId: null,
          gitBranch: command.gitBranch ?? null,
          processId: null,
          projectDirectory: '/repo/app',
          projectId: command.projectId,
          sessionId: 'agent-session-failed',
          status: 'failed',
          terminalSourceTheme: command.terminalSourceTheme,
          workspaceDirectory: '/repo/app',
          workspaceName: 'main'
        })),
        inspectCodexCli: vi.fn(async () => ({
          installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
          status: 'installed',
          version: 'codex-cli 0.143.0'
        }))
      })
    })

    render(<AgentConsole currentWorkbench={workbench} currentWorkspace={currentWorkspace} />)

    expect(await screen.findByText('Codex 会话启动失败')).toBeInTheDocument()
    expect(screen.queryByText('已安装')).not.toBeInTheDocument()
    expect(screen.queryByText('已连接')).not.toBeInTheDocument()
  })

  it('offers restrained retry and new-conversation actions when restoration fails', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app', { gitBranch: 'feature/login' })
    const currentWorkspace = workbench.project.workspaces[0]!
    const attachAgentSession = vi.fn(async (command) => ({
      agentId: command.agentId,
      codexThreadId: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33',
      gitBranch: 'feature/login',
      processId: null,
      projectDirectory: '/repo/app',
      projectId: workbench.project.id,
      sessionId: 'agent-session-failed',
      status: 'restore_failed' as const,
      terminalSourceTheme: command.terminalSourceTheme,
      workspaceDirectory: '/repo/app',
      workspaceName: 'main'
    }))

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        attachAgentSession,
        inspectCodexCli: vi.fn(async () => ({
          installCommand: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh',
          status: 'installed',
          version: 'codex-cli 0.143.0'
        }))
      })
    })

    render(<AgentConsole currentWorkbench={workbench} currentWorkspace={currentWorkspace} />)

    expect(await screen.findByText('无法恢复上次对话')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() =>
      expect(attachAgentSession).toHaveBeenLastCalledWith(
        expect.objectContaining({
          gitBranch: 'feature/login',
          projectId: workbench.project.id,
          restartMode: 'retry'
        })
      )
    )
    fireEvent.click(screen.getByRole('button', { name: '新对话' }))
    await waitFor(() =>
      expect(attachAgentSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ restartMode: 'new' })
      )
    )
  })

  it('keeps the browser preview honest when the desktop runtime is unavailable', async () => {
    render(<AgentConsole />)

    await waitFor(() => expect(screen.getByText('桌面运行时未连接')).toBeInTheDocument())
    expect(screen.queryByText('Codex CLI')).not.toBeInTheDocument()
    expect(screen.queryByText('未接入')).not.toBeInTheDocument()
    expect(screen.queryByText('已安装')).not.toBeInTheDocument()
    expect(screen.queryByText('未安装')).not.toBeInTheDocument()
  })
})
