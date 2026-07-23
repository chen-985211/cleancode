import type {
  AgentMcpRegistration,
  AgentMcpServerPort,
  RegisteredAgentMcpSession
} from '../../../../src/contexts/agent/application/ports/AgentMcpServerPort'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import type { AgentToolExecutionResult } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import type { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
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
})

class ApplicationShutdownTerminalRuntime extends RecordingAgentTerminalRuntime {
  readonly disposeAllOperation = vi.fn(async () => undefined)
  readonly releaseApplicationShutdown = vi.fn()

  override disposeAll(): Promise<void> {
    return this.disposeAllOperation()
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
  delete(): Promise<void> {
    return Promise.resolve()
  }

  deleteAgent(): Promise<void> {
    return Promise.resolve()
  }

  deleteProject(): Promise<void> {
    return Promise.resolve()
  }

  find(): Promise<AgentSession | null> {
    return Promise.resolve(null)
  }

  findAgent(): Promise<AgentSession | null> {
    return Promise.resolve(null)
  }

  findWorkspace(): Promise<readonly AgentSession[]> {
    return Promise.resolve([])
  }

  save(): Promise<void> {
    return Promise.resolve()
  }
}

class GatedAgentSessionRepository extends EmptyAgentSessionRepository {
  readonly saveStarted = createDeferred<void>()
  private readonly saveFinished = createDeferred<void>()

  override save(): Promise<void> {
    this.saveStarted.resolve()
    return this.saveFinished.promise
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
    workspaceName: 'main'
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
      workspaceName: 'main'
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
