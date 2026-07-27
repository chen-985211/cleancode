import type {
  AgentMcpRegistration,
  AgentMcpServerPort,
  RegisteredAgentMcpSession
} from '../../../../src/contexts/agent/application/ports/AgentMcpServerPort'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import type { AgentToolExecutionResult } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import {
  RecordingAgentProviderRegistry,
  RecordingAgentTerminalRuntime
} from '../../../fixtures/agentTerminalRuntime'

describe('Agent application shutdown', () => {
  it('closes admission, drains approvals and persistence, and releases local resources without stopping PTYs', async () => {
    const persistence = new GatedAgentSessionRepository()
    const terminal = new ApplicationShutdownTerminalRuntime()
    const mcp = new RecordingMcpServer()
    const providers = new RecordingAgentProviderRegistry()
    const disposeArtifact = vi.fn(async () => undefined)
    providers.contribution.launcher.createLaunchPlan = async (command) => {
      providers.launchCommands.push(command)
      command.artifacts.track('provider-runtime', { dispose: disposeArtifact })
      return { args: [], env: {}, executable: 'fake-agent' }
    }
    const cancel = vi.fn(async (command, reason) => canceledResult(command.toolCallId, reason))
    const service = new AgentSessionService(
      terminal,
      mcp,
      {
        cancel,
        execute: vi.fn(async (command) => awaitingApproval(command.toolCallId))
      },
      persistence,
      providers,
      'codex'
    )
    const session = await service.attach(attachCommand())
    const toolResult = service.executeMcpTool({
      input: {},
      sessionId: session.sessionId,
      toolCallId: 'approval-1',
      toolName: 'inspect_graph'
    })
    await vi.waitFor(() => expect(service.listPendingApprovals()).toHaveLength(1))

    providers.launchCommands[0]?.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'thread',
      value: 'provider-session-1'
    })
    await persistence.saveStarted.promise

    const preparation = service.prepareApplicationShutdown()
    await vi.waitFor(() => expect(mcp.disposedSessionIds).toEqual([session.sessionId]))

    await expect(service.attach(attachCommand())).rejects.toMatchObject({
      code: 'AGENT_SESSION_NOT_FOUND'
    })
    await expect(toolResult).resolves.toMatchObject({ status: 'canceled' })
    expect(cancel).toHaveBeenCalledWith(
      expect.objectContaining({ toolCallId: 'approval-1' }),
      'Agent session was disposed.'
    )
    expect(terminal.stops).toEqual([])
    expect(terminal.disposeAllOperation).not.toHaveBeenCalled()

    let prepared = false
    void preparation.then(() => {
      prepared = true
    })
    await Promise.resolve()
    expect(prepared).toBe(false)

    persistence.releaseSave()
    await preparation
    await service.prepareApplicationShutdown()
    await service.completeApplicationShutdown()
    await service.completeApplicationShutdown()

    expect(disposeArtifact).toHaveBeenCalledOnce()
    expect(mcp.dispose).toHaveBeenCalledOnce()
    expect(terminal.releaseApplicationShutdown).toHaveBeenCalledOnce()
    expect(terminal.stops).toEqual([])
    expect(terminal.disposeAllOperation).not.toHaveBeenCalled()
  })

  it('keeps explicit disposeAll as the PTY-owning hard-dispose path', async () => {
    const terminal = new ApplicationShutdownTerminalRuntime()
    const service = new AgentSessionService(
      terminal,
      new RecordingMcpServer(),
      {
        cancel: vi.fn(async (command, reason) => canceledResult(command.toolCallId, reason)),
        execute: vi.fn(async (command) => completedResult(command.toolCallId))
      },
      new EmptyAgentSessionRepository(),
      new RecordingAgentProviderRegistry(),
      'codex'
    )
    await service.attach(attachCommand())

    await service.disposeAll()

    expect(terminal.disposeAllOperation).toHaveBeenCalledOnce()
    expect(terminal.releaseApplicationShutdown).not.toHaveBeenCalled()
  })

  it('does not release local terminal ownership before preparation has settled', async () => {
    const persistence = new GatedAgentSessionRepository()
    const terminal = new ApplicationShutdownTerminalRuntime()
    const providers = new RecordingAgentProviderRegistry()
    const service = new AgentSessionService(
      terminal,
      new RecordingMcpServer(),
      {
        cancel: vi.fn(async (command, reason) => canceledResult(command.toolCallId, reason)),
        execute: vi.fn(async (command) => completedResult(command.toolCallId))
      },
      persistence,
      providers,
      'codex'
    )
    await service.attach(attachCommand())
    providers.launchCommands[0]?.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'thread',
      value: 'provider-session-1'
    })
    await persistence.saveStarted.promise

    const preparation = service.prepareApplicationShutdown()
    const completion = service.completeApplicationShutdown()
    await Promise.resolve()

    expect(terminal.releaseApplicationShutdown).not.toHaveBeenCalled()

    persistence.releaseSave()
    await Promise.all([preparation, completion, service.completeApplicationShutdown()])
    expect(terminal.releaseApplicationShutdown).toHaveBeenCalledOnce()
  })

  it('accepts and drains the final Provider identity after prepare and before completion', async () => {
    const repository = new RecordingAgentSessionRepository()
    const terminal = new ApplicationShutdownTerminalRuntime()
    const providers = new RecordingAgentProviderRegistry()
    const disposeArtifact = vi.fn(async () => undefined)
    providers.contribution.launcher.createLaunchPlan = async (command) => {
      providers.launchCommands.push(command)
      command.artifacts.track('provider-runtime', { dispose: disposeArtifact })
      return { args: [], env: {}, executable: 'fake-agent' }
    }
    const service = new AgentSessionService(
      terminal,
      new RecordingMcpServer(),
      {
        cancel: vi.fn(async (command, reason) => canceledResult(command.toolCallId, reason)),
        execute: vi.fn(async (command) => completedResult(command.toolCallId))
      },
      repository,
      providers,
      'codex'
    )
    await service.attach(attachCommand())
    const providerLaunch = providers.launchCommands[0]
    expect(providerLaunch).toBeDefined()
    providerLaunch?.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
    await vi.waitFor(() => expect(repository.saveCount).toBe(1))
    expect(repository.savedProviderSessionRefs).toEqual([
      expect.objectContaining({ value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33' })
    ])
    await vi.waitFor(() =>
      expect(repository.providerSessionRef?.value).toBe('0190d8a1-8b7d-7d75-9f62-7a663ef87e33')
    )

    await service.prepareApplicationShutdown()

    expect(disposeArtifact).not.toHaveBeenCalled()
    providerLaunch?.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0290d8a1-8b7d-7d75-9f62-7a663ef87e44'
    })
    await service.completeApplicationShutdown()

    expect(disposeArtifact).toHaveBeenCalledOnce()
    expect(repository.providerSessionRef?.value).toBe('0290d8a1-8b7d-7d75-9f62-7a663ef87e44')
    expect(terminal.releaseApplicationShutdown).toHaveBeenCalledOnce()
  })

  it('drains the final Provider identity before disposing an Agent runtime', async () => {
    const repository = new GatedRecordingAgentSessionRepository()
    const terminal = new ApplicationShutdownTerminalRuntime()
    const providers = new RecordingAgentProviderRegistry()
    providers.contribution.launcher.createLaunchPlan = async (command) => {
      providers.launchCommands.push(command)
      return {
        args: [],
        env: {},
        executable: 'fake-agent',
        gracefulShutdown: {
          inputIntervalMs: 0,
          inputs: ['provider-graceful-exit'],
          timeoutMs: 1_000
        }
      }
    }
    const service = new AgentSessionService(
      terminal,
      new RecordingMcpServer(),
      {
        cancel: vi.fn(async (command, reason) => canceledResult(command.toolCallId, reason)),
        execute: vi.fn(async (command) => completedResult(command.toolCallId))
      },
      repository,
      providers,
      'codex'
    )
    await service.attach(attachCommand())
    terminal.onWrite = () => {
      providers.launchCommands[0]?.onProviderSessionIdentified({
        formatVersion: 1,
        kind: 'codex-thread',
        value: '0290d8a1-8b7d-7d75-9f62-7a663ef87e44'
      })
      terminal.launches[0]?.onExit({
        exitCode: 0,
        generation: 1,
        launchId: 'launch-1'
      })
    }

    const disposal = service.disposeAgent({
      agentId: 'agent-1',
      projectId: 'project-1',
      workspaceId: 'main'
    })
    let disposed = false
    void disposal.then(() => {
      disposed = true
    })
    await repository.saveStarted.promise
    expect(disposed).toBe(false)

    repository.releaseSave()
    const lease = await disposal
    lease.release()
    expect(repository.providerSessionRef?.value).toBe('0290d8a1-8b7d-7d75-9f62-7a663ef87e44')
  })

  it('stages a Provider-owned graceful launch exit request and stops writing after exit', async () => {
    const terminal = new ApplicationShutdownTerminalRuntime()
    const providers = new RecordingAgentProviderRegistry()
    providers.contribution.launcher.createLaunchPlan = async (command) => {
      providers.launchCommands.push(command)
      return {
        args: [],
        env: {},
        executable: 'fake-agent',
        gracefulShutdown: {
          inputIntervalMs: 100,
          inputs: ['leave-overlay', 'provider-graceful-exit', 'confirm', 'confirm-fallback'],
          timeoutMs: 1_000
        }
      }
    }
    const service = new AgentSessionService(
      terminal,
      new RecordingMcpServer(),
      {
        cancel: vi.fn(async (command, reason) => canceledResult(command.toolCallId, reason)),
        execute: vi.fn(async (command) => completedResult(command.toolCallId))
      },
      new EmptyAgentSessionRepository(),
      providers,
      'codex'
    )
    const session = await service.attach(attachCommand())

    vi.useFakeTimers()
    try {
      const preparation = service.prepareApplicationShutdown()
      await terminal.firstWrite.promise
      expect(terminal.writes).toEqual([{ input: 'leave-overlay', sessionId: session.sessionId }])

      await vi.advanceTimersByTimeAsync(100)
      expect(terminal.writes).toEqual([
        { input: 'leave-overlay', sessionId: session.sessionId },
        { input: 'provider-graceful-exit', sessionId: session.sessionId }
      ])

      await vi.advanceTimersByTimeAsync(100)
      expect(terminal.writes).toEqual([
        { input: 'leave-overlay', sessionId: session.sessionId },
        { input: 'provider-graceful-exit', sessionId: session.sessionId },
        { input: 'confirm', sessionId: session.sessionId }
      ])

      terminal.launches[0]?.onExit({
        exitCode: 0,
        generation: 1,
        launchId: 'launch-1'
      })
      await preparation
      expect(terminal.writes).not.toContainEqual({
        input: 'confirm-fallback',
        sessionId: session.sessionId
      })

      await service.completeApplicationShutdown()
      expect(terminal.releaseApplicationShutdown).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('bounds a Provider graceful exit request when the launch does not exit', async () => {
    const terminal = new ApplicationShutdownTerminalRuntime()
    const providers = new RecordingAgentProviderRegistry()
    providers.contribution.launcher.createLaunchPlan = async (command) => {
      providers.launchCommands.push(command)
      return {
        args: [],
        env: {},
        executable: 'fake-agent',
        gracefulShutdown: {
          inputIntervalMs: 100,
          inputs: ['provider-graceful-exit', 'confirm'],
          timeoutMs: 500
        }
      }
    }
    const service = new AgentSessionService(
      terminal,
      new RecordingMcpServer(),
      {
        cancel: vi.fn(async (command, reason) => canceledResult(command.toolCallId, reason)),
        execute: vi.fn(async (command) => completedResult(command.toolCallId))
      },
      new EmptyAgentSessionRepository(),
      providers,
      'codex'
    )
    const session = await service.attach(attachCommand())

    vi.useFakeTimers()
    try {
      const preparation = service.prepareApplicationShutdown()
      await terminal.firstWrite.promise
      await vi.advanceTimersByTimeAsync(100)
      expect(terminal.writes).toEqual([
        { input: 'provider-graceful-exit', sessionId: session.sessionId },
        { input: 'confirm', sessionId: session.sessionId }
      ])

      let prepared = false
      void preparation.then(() => {
        prepared = true
      })
      await vi.advanceTimersByTimeAsync(499)
      expect(prepared).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      await preparation
      expect(prepared).toBe(true)
      expect(terminal.stops).toEqual([])

      await service.completeApplicationShutdown()
      expect(terminal.releaseApplicationShutdown).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})

class ApplicationShutdownTerminalRuntime extends RecordingAgentTerminalRuntime {
  readonly disposeAllOperation = vi.fn(async () => undefined)
  readonly firstWrite = createDeferred<void>()
  readonly releaseApplicationShutdown = vi.fn()
  onWrite: (() => void) | null = null

  override disposeAll(): Promise<void> {
    return this.disposeAllOperation()
  }

  override write(sessionId: string, input: string): void {
    super.write(sessionId, input)
    this.firstWrite.resolve()
    this.onWrite?.()
  }
}

class RecordingMcpServer implements AgentMcpServerPort {
  readonly dispose = vi.fn()
  readonly disposedSessionIds: string[] = []

  registerSession(session: RegisteredAgentMcpSession): Promise<AgentMcpRegistration> {
    return Promise.resolve({
      bearerToken: `token-${session.sessionId}`,
      dispose: () => this.disposedSessionIds.push(session.sessionId),
      url: `http://127.0.0.1/${session.sessionId}`
    })
  }
}

class EmptyAgentSessionRepository implements AgentSessionRepository {
  readonly delete: AgentSessionRepository['delete'] = () => Promise.resolve()
  readonly deleteAgent: AgentSessionRepository['deleteAgent'] = () => Promise.resolve()
  readonly deleteProject: AgentSessionRepository['deleteProject'] = () => Promise.resolve()
  readonly find: AgentSessionRepository['find'] = () => Promise.resolve(null)
  readonly findAgent: AgentSessionRepository['findAgent'] = () => Promise.resolve(null)
  readonly findWorkspace: AgentSessionRepository['findWorkspace'] = () => Promise.resolve([])
  readonly save: AgentSessionRepository['save'] = () => Promise.resolve()
}

class RecordingAgentSessionRepository extends EmptyAgentSessionRepository {
  private persistedSession: AgentSession | null = null
  findCount = 0
  saveCount = 0
  readonly savedProviderSessionRefs: unknown[] = []

  get providerSessionRef() {
    return this.persistedSession?.providerSessionRef?.toSnapshot() ?? null
  }

  override readonly find: AgentSessionRepository['find'] = (scope) => {
    this.findCount += 1
    return Promise.resolve(
      this.persistedSession
        ? AgentSession.fromSnapshot(this.persistedSession.toSnapshot(), scope)
        : null
    )
  }

  override readonly save: AgentSessionRepository['save'] = (session) => {
    this.saveCount += 1
    this.savedProviderSessionRefs.push(session.toSnapshot().providerSessionRef)
    this.persistedSession = AgentSession.fromSnapshot(session.toSnapshot())
    return Promise.resolve()
  }
}

class GatedAgentSessionRepository extends EmptyAgentSessionRepository {
  readonly saveStarted = createDeferred<void>()
  private readonly saveFinished = createDeferred<void>()

  override readonly save: AgentSessionRepository['save'] = () => {
    this.saveStarted.resolve()
    return this.saveFinished.promise
  }

  releaseSave(): void {
    this.saveFinished.resolve()
  }
}

class GatedRecordingAgentSessionRepository extends EmptyAgentSessionRepository {
  readonly saveStarted = createDeferred<void>()
  private readonly saveFinished = createDeferred<void>()
  private persistedSession: AgentSession | null = null

  get providerSessionRef() {
    return this.persistedSession?.providerSessionRef?.toSnapshot() ?? null
  }

  override readonly save: AgentSessionRepository['save'] = async (session) => {
    this.saveStarted.resolve()
    await this.saveFinished.promise
    this.persistedSession = AgentSession.fromSnapshot(session.toSnapshot())
  }

  releaseSave(): void {
    this.saveFinished.resolve()
  }
}

function attachCommand() {
  return {
    agentId: 'agent-1',
    onGraphUpdated: vi.fn(),
    onRuntimeChanged: vi.fn(),
    onToolApprovalRequested: vi.fn(),
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    terminalSourceTheme: 'light' as const,
    workspaceDirectory: '/repo/app',
    workspaceId: 'main'
  }
}

function awaitingApproval(toolCallId: string): AgentToolExecutionResult {
  return {
    approval: {
      summary: 'Inspect the graph',
      target: { blockId: 'terminal-1', kind: 'terminal_block' },
      toolName: 'inspect_graph'
    },
    status: 'awaiting_approval',
    toolCallId
  }
}

function canceledResult(toolCallId: string, reason: string): AgentToolExecutionResult {
  return {
    output: { reason, type: 'tool_canceled' },
    status: 'canceled',
    toolCallId
  }
}

function completedResult(toolCallId: string): AgentToolExecutionResult {
  return {
    graph: {
      blocks: [],
      id: 'graph-1',
      projectId: 'project-1',
      terminalGroups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      workspaceId: 'main'
    },
    graphChanged: false,
    output: { type: 'block_graph' },
    status: 'completed',
    toolCallId
  }
}

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}
