import { render, screen, waitFor } from '@testing-library/react'

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
        attachAgentSession: vi.fn(async () => ({
          processId: null,
          projectDirectory: '/repo/app',
          sessionId: 'agent-session-failed',
          status: 'failed',
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

  it('keeps the browser preview honest when the desktop runtime is unavailable', async () => {
    render(<AgentConsole />)

    await waitFor(() => expect(screen.getByText('桌面运行时未连接')).toBeInTheDocument())
    expect(screen.getAllByText('Codex CLI')).toHaveLength(1)
    expect(screen.queryByText('未接入')).not.toBeInTheDocument()
    expect(screen.queryByText('已安装')).not.toBeInTheDocument()
    expect(screen.queryByText('未安装')).not.toBeInTheDocument()
  })
})
