import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { AgentConsole } from '../../../src/presentation/app-shell/AgentConsole'
import type { AgentSessionSnapshot } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import {
  createAgentSessionSnapshot,
  createRuntimeApi,
  createWorkbenchSnapshot
} from '../../fixtures/presentation/appShellFixtures'

describe('Agent console attach lifecycle', () => {
  afterEach(() => Reflect.deleteProperty(window, 'cleancode'))

  it('keeps attach failures visible and retries through one generic action', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const attachAgentSession = vi
      .fn()
      .mockRejectedValueOnce(new Error('pty unavailable'))
      .mockResolvedValueOnce(createAgentSessionSnapshot())
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ attachAgentSession })
    })

    render(
      <AgentConsole
        currentWorkbench={workbench}
        currentWorkspace={workbench.project.workspaces[0]}
      />
    )

    expect(await screen.findByText('无法连接 Codex 会话')).toBeInTheDocument()
    const terminalShell = screen.getByRole('region', { name: 'Codex CLI 会话' })
    expect(terminalShell).toHaveAttribute('data-agent-attach-operation-status', 'failed')
    fireEvent.click(screen.getByRole('button', { name: '重试连接 Codex 会话' }))

    await waitFor(() => expect(attachAgentSession).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText('无法连接 Codex 会话')).not.toBeInTheDocument())
    expect(terminalShell).toHaveAttribute('data-agent-attach-operation-status', 'idle')
  })

  it('single-flights duplicate retries', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const retry = deferred<AgentSessionSnapshot>()
    const attachAgentSession = vi
      .fn()
      .mockRejectedValueOnce(new Error('pty unavailable'))
      .mockImplementationOnce(() => retry.promise)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ attachAgentSession })
    })

    render(
      <AgentConsole
        currentWorkbench={workbench}
        currentWorkspace={workbench.project.workspaces[0]}
      />
    )

    const retryButton = await screen.findByRole('button', { name: '重试连接 Codex 会话' })
    fireEvent.click(retryButton)
    fireEvent.click(retryButton)

    await waitFor(() => expect(attachAgentSession).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('Codex CLI 会话').closest('[aria-busy="true"]')).not.toBeNull()

    await act(async () => retry.resolve(createAgentSessionSnapshot()))
  })

  it('preserves the current terminal binding when a restart attach fails', async () => {
    const workbench = createWorkbenchSnapshot('/repo/app', 'app')
    const initialSession = createAgentSessionSnapshot({
      runtime: {
        ...createAgentSessionSnapshot().runtime,
        launch: {
          ...createAgentSessionSnapshot().runtime.launch,
          status: 'exited'
        }
      },
      sessionId: 'preserved-session'
    })
    const attachAgentSession = vi
      .fn()
      .mockResolvedValueOnce(initialSession)
      .mockRejectedValueOnce(new Error('restart failed'))
    const writeAgentSession = vi.fn(async () => undefined)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ attachAgentSession, writeAgentSession })
    })

    render(
      <AgentConsole
        currentWorkbench={workbench}
        currentWorkspace={workbench.project.workspaces[0]}
      />
    )

    await openAgentStatus('Agent 1')
    fireEvent.click(screen.getByRole('button', { name: '重新启动 Agent' }))
    await openAgentStatus('Agent 1')
    expect(screen.getByText('无法连接 Codex 会话')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Codex CLI 输入' }), {
      target: { value: 'still connected' }
    })

    expect(writeAgentSession).toHaveBeenCalledWith({
      input: 'still connected',
      sessionId: 'preserved-session'
    })
  })

  it('ignores an attach result from a previous workspace scope', async () => {
    const first = createWorkbenchSnapshot('/repo/first', 'first')
    const second = createWorkbenchSnapshot('/repo/second', 'second')
    const firstAttach = deferred<AgentSessionSnapshot>()
    const attachAgentSession = vi
      .fn()
      .mockImplementationOnce(() => firstAttach.promise)
      .mockResolvedValueOnce(
        createAgentSessionSnapshot({
          projectDirectory: '/repo/second',
          projectId: second.project.id,
          sessionId: 'second-session',
          workspaceDirectory: '/repo/second'
        })
      )
    const writeAgentSession = vi.fn(async () => undefined)
    Object.defineProperty(window, 'cleancode', {
      configurable: true,
      value: createRuntimeApi({ attachAgentSession, writeAgentSession })
    })

    const { rerender } = render(
      <AgentConsole currentWorkbench={first} currentWorkspace={first.project.workspaces[0]} />
    )
    await waitFor(() => expect(attachAgentSession).toHaveBeenCalledOnce())

    rerender(
      <AgentConsole currentWorkbench={second} currentWorkspace={second.project.workspaces[0]} />
    )
    await waitFor(() => expect(attachAgentSession).toHaveBeenCalledTimes(2))
    await act(async () =>
      firstAttach.resolve(
        createAgentSessionSnapshot({
          projectDirectory: '/repo/first',
          projectId: first.project.id,
          sessionId: 'stale-session',
          workspaceDirectory: '/repo/first'
        })
      )
    )

    fireEvent.change(screen.getByRole('textbox', { name: 'Codex CLI 输入' }), {
      target: { value: 'current' }
    })
    expect(writeAgentSession).toHaveBeenLastCalledWith({
      input: 'current',
      sessionId: 'second-session'
    })
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function openAgentStatus(agentName: string): Promise<void> {
  fireEvent.click(
    await screen.findByRole('button', {
      name: new RegExp(`^${agentName} 有 \\d+ 个状态需要处理$`)
    })
  )
}
