import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AgentConsole } from '../../../src/presentation/app-shell/AgentConsole'
import type {
  AgentLaunchRuntimeStatus,
  AgentRuntimeChangedEvent,
  AgentRuntimeSnapshot,
  AgentSessionSnapshot,
  AgentTerminalRuntimeStatus
} from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import {
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

const installCommand = 'curl -fsSL https://chatgpt.com/codex/install.sh | sh'

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

  it('trusts a running Codex session over a stale missing-CLI inspection', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const currentWorkspace = workbench.project.workspaces[0]!
    const inspectCodexCli = vi.fn(async () => createMissingSnapshot())

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        inspectCodexCli
      })
    })

    render(<AgentConsole currentWorkbench={workbench} currentWorkspace={currentWorkspace} />)

    await waitFor(() => expect(window.cleancode?.attachAgentSession).toHaveBeenCalled())
    await waitFor(() => expect(inspectCodexCli).toHaveBeenCalled())
    expect(screen.queryByText('未检测到 Codex CLI')).not.toBeInTheDocument()
  })

  it('retries the first missing result before showing any warning', async () => {
    vi.useFakeTimers()
    const inspectCodexCli = vi
      .fn()
      .mockResolvedValueOnce(createMissingSnapshot())
      .mockResolvedValueOnce({ status: 'installed', version: 'codex-cli 0.144.6' })

    try {
      Object.defineProperty(window, 'cleancode', {
        configurable: true,
        value: createRuntimeApi({ inspectCodexCli })
      })

      render(<AgentConsole />)
      await flushMicrotasks()

      expect(inspectCodexCli).toHaveBeenCalledTimes(1)
      expect(screen.queryByText('未检测到 Codex CLI')).not.toBeInTheDocument()

      await advanceTimers(600)

      expect(inspectCodexCli).toHaveBeenCalledTimes(2)
      expect(screen.queryByText('未检测到 Codex CLI')).not.toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('delays the checking notice so fast inspections remain quiet', async () => {
    vi.useFakeTimers()
    const pendingInspection = new Promise<never>(() => undefined)

    try {
      Object.defineProperty(window, 'cleancode', {
        configurable: true,
        value: createRuntimeApi({ inspectCodexCli: vi.fn(() => pendingInspection) })
      })

      render(<AgentConsole />)

      expect(screen.queryByText('正在检查 Codex CLI')).not.toBeInTheDocument()
      await advanceTimers(399)
      expect(screen.queryByText('正在检查 Codex CLI')).not.toBeInTheDocument()
      await advanceTimers(1)
      expect(screen.getByText('正在检查 Codex CLI')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reveals install guidance only after a missing executable is confirmed twice', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    })
    const inspectCodexCli = vi.fn(async () => createMissingSnapshot())

    try {
      Object.defineProperty(window, 'cleancode', {
        configurable: true,
        value: createRuntimeApi({ inspectCodexCli })
      })

      render(<AgentConsole />)
      await flushMicrotasks()
      await advanceTimers(600)

      expect(screen.getByText('未检测到 Codex CLI')).toBeInTheDocument()
      expect(screen.queryByText(installCommand)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '重新检查 Codex CLI' })).toBeInTheDocument()

      fireEvent.click(screen.getByText('安装帮助'))
      expect(screen.getByText(installCommand)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '复制安装命令' }))
      await flushMicrotasks()
      expect(writeText).toHaveBeenCalledWith(installCommand)
      expect(screen.getByText('已复制')).toBeInTheDocument()
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard')
      vi.useRealTimers()
    }
  })

  it('keeps temporary inspection failures neutral and lets the user retry', async () => {
    vi.useFakeTimers()
    const inspectCodexCli = vi
      .fn()
      .mockResolvedValueOnce(createUnavailableSnapshot('timed_out'))
      .mockResolvedValueOnce(createUnavailableSnapshot('timed_out'))
      .mockResolvedValueOnce({ status: 'installed', version: 'codex-cli 0.144.6' })

    try {
      Object.defineProperty(window, 'cleancode', {
        configurable: true,
        value: createRuntimeApi({ inspectCodexCli })
      })

      render(<AgentConsole />)
      await flushMicrotasks()
      await advanceTimers(600)

      expect(screen.getByText('暂时无法检查 Codex CLI')).toBeInTheDocument()
      expect(screen.queryByText('未检测到 Codex CLI')).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '重新检查 Codex CLI' }))
      await flushMicrotasks()

      expect(inspectCodexCli).toHaveBeenCalledTimes(3)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('surfaces a failed session as the single actionable status', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const currentWorkspace = workbench.project.workspaces[0]!

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        attachAgentSession: vi.fn(async (command) => ({
          agentId: command.agentId,
          gitBranch: command.gitBranch ?? null,
          projectDirectory: '/repo/app',
          projectId: command.projectId,
          providerId: 'codex',
          providerSessionRef: null,
          runtime: createRuntime(0, 1, 'not_started', { terminalStatus: 'failed' }),
          sessionId: 'agent-session-failed',
          terminalSourceTheme: command.terminalSourceTheme,
          workspaceDirectory: '/repo/app',
          workspaceId: 'main'
        })),
        inspectCodexCli: vi.fn(async () => createMissingSnapshot())
      })
    })

    render(<AgentConsole currentWorkbench={workbench} currentWorkspace={currentWorkspace} />)

    await openAgentStatus()
    expect(screen.getByText('Codex 会话启动失败')).toBeInTheDocument()
    expect(screen.queryByText('未检测到 Codex CLI')).not.toBeInTheDocument()
  })

  it('offers restrained retry and new-conversation actions when restoration fails', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app', { gitBranch: 'feature/login' })
    const currentWorkspace = workbench.project.workspaces[0]!
    const attachAgentSession = vi.fn(async (command) => ({
      agentId: command.agentId,
      gitBranch: 'feature/login',
      projectDirectory: '/repo/app',
      projectId: workbench.project.id,
      providerId: 'codex',
      providerSessionRef: null,
      runtime: createRuntime(0, 1, 'failed', {
        failureKind: 'restore',
        terminalStatus: 'not_started'
      }),
      sessionId: 'agent-session-failed',
      terminalSourceTheme: command.terminalSourceTheme,
      workspaceDirectory: '/repo/app',
      workspaceId: 'main'
    }))

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        attachAgentSession,
        inspectCodexCli: vi.fn(async () => createMissingSnapshot())
      })
    })

    render(<AgentConsole currentWorkbench={workbench} currentWorkspace={currentWorkspace} />)

    await openAgentStatus()
    expect(screen.getByText('无法恢复上次对话')).toBeInTheDocument()
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
    await openAgentStatus()
    fireEvent.click(screen.getByRole('button', { name: '新对话' }))
    await waitFor(() =>
      expect(attachAgentSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ restartMode: 'new' })
      )
    )
  })

  it('keeps the terminal available and offers restart actions after the Provider exits', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const currentWorkspace = workbench.project.workspaces[0]!
    const attachAgentSession = vi.fn(async (command) => ({
      agentId: command.agentId,
      gitBranch: null,
      projectDirectory: '/repo/app',
      projectId: workbench.project.id,
      providerId: 'codex',
      providerSessionRef: null,
      runtime: createRuntime(
        command.restartMode ? 2 : 1,
        command.restartMode ? 3 : 2,
        command.restartMode ? 'running' : 'exited'
      ),
      sessionId: 'agent-session-exited',
      terminalSourceTheme: command.terminalSourceTheme,
      workspaceDirectory: '/repo/app',
      workspaceId: 'main'
    }))
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ attachAgentSession })
    })

    render(<AgentConsole currentWorkbench={workbench} currentWorkspace={currentWorkspace} />)

    await openAgentStatus()
    expect(screen.getByText('Codex 会话已结束')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新启动 Agent' }))
    await waitFor(() =>
      expect(attachAgentSession).toHaveBeenLastCalledWith(
        expect.objectContaining({ restartMode: 'retry' })
      )
    )
  })

  it('reconciles a launch exit racing attach without poisoning a newer launch generation', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const currentWorkspace = workbench.project.workspaces[0]!
    let runtimeListener: ((event: AgentRuntimeChangedEvent) => void) | null = null
    const subscribeRuntime = vi.fn((listener: (event: AgentRuntimeChangedEvent) => void) => {
      runtimeListener = listener
      return vi.fn()
    })
    let resolveInitialAttach: ((snapshot: ReturnType<typeof createRuntimeSession>) => void) | null =
      null
    const initialAttach = new Promise<ReturnType<typeof createRuntimeSession>>((resolve) => {
      resolveInitialAttach = resolve
    })
    const attachAgentSession = vi.fn((command) =>
      command.restartMode ? Promise.resolve(createRuntimeSession(2, 4, 'running')) : initialAttach
    )

    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({
        attachAgentSession,
        onAgentRuntimeChanged: subscribeRuntime
      })
    })

    render(<AgentConsole currentWorkbench={workbench} currentWorkspace={currentWorkspace} />)
    await waitFor(() => expect(attachAgentSession).toHaveBeenCalledTimes(1))

    act(() => {
      runtimeListener?.(createRuntimeEvent(1, 2, 'exited'))
      resolveInitialAttach?.(createRuntimeSession(1, 1, 'running'))
    })

    await openAgentStatus()
    expect(screen.getByText('Codex 会话已结束')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新启动 Agent' }))
    await waitFor(() => expect(attachAgentSession).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('Codex 会话已结束')).not.toBeInTheDocument())

    act(() => runtimeListener?.(createRuntimeEvent(1, 3, 'exited')))

    expect(screen.queryByText('Codex 会话已结束')).not.toBeInTheDocument()
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

function createMissingSnapshot() {
  return {
    installCommand,
    reason: 'not_found' as const,
    status: 'missing' as const,
    version: null
  }
}

function createUnavailableSnapshot(reason: 'timed_out') {
  return {
    reason,
    status: 'temporarily_unavailable' as const,
    version: null
  }
}

async function advanceTimers(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds)
  })
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

async function openAgentStatus(): Promise<void> {
  fireEvent.click(
    await screen.findByRole('button', {
      name: /^Agent 1 有 \d+ 个状态需要处理$/
    })
  )
}

function createRuntimeSession(
  generation: number,
  revision: number,
  launchStatus: 'exited' | 'running'
): AgentSessionSnapshot {
  return {
    agentId: 'default-agent',
    gitBranch: null,
    projectDirectory: '/repo/app',
    projectId: 'project-app',
    providerId: 'codex',
    providerSessionRef: null,
    runtime: createRuntime(generation, revision, launchStatus),
    sessionId: 'agent-session-race',
    terminalSourceTheme: 'dark' as const,
    workspaceDirectory: '/repo/app',
    workspaceId: 'main'
  }
}

function createRuntimeEvent(
  generation: number,
  revision: number,
  launchStatus: 'exited' | 'running'
): AgentRuntimeChangedEvent {
  return {
    agentId: 'default-agent',
    runtime: createRuntime(generation, revision, launchStatus),
    sessionId: 'agent-session-race'
  }
}

function createRuntime(
  generation: number,
  revision: number,
  launchStatus: AgentLaunchRuntimeStatus,
  options: {
    readonly failureKind?: AgentRuntimeSnapshot['launch']['failureKind']
    readonly terminalStatus?: AgentTerminalRuntimeStatus
  } = {}
): AgentRuntimeSnapshot {
  const terminalStatus = options.terminalStatus ?? 'running'
  return {
    activity: { status: 'unavailable' as const },
    binding: { status: 'unbound' },
    launch: {
      exitCode: launchStatus === 'exited' ? 0 : null,
      failureKind: options.failureKind ?? null,
      generation,
      launchId: generation === 0 ? null : `launch-${generation}`,
      status: launchStatus
    },
    mcp: { status: 'ready' },
    revision,
    terminal: {
      exitCode: null,
      processId: terminalStatus === 'running' ? 42 : null,
      status: terminalStatus,
      stopReason: null,
      viewIdentity: null
    }
  }
}
