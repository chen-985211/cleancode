import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import type {
  AgentMcpServerPort,
  RegisteredAgentMcpSession
} from '../../../../src/contexts/agent/application/ports/AgentMcpServerPort'
import type {
  CodexAgentProcessPort,
  StartCodexAgentProcessCommand
} from '../../../../src/contexts/agent/application/ports/CodexAgentProcessPort'
import type { AgentToolExecutionResult } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import type { ExecuteAgentToolCommand } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import type { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import type { AgentConversationScope } from '../../../../src/contexts/agent/domain/value-objects/AgentConversationScope'

describe('agent session service', () => {
  it('keeps one background Codex PTY per workspace and reattaches without restarting it', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const service = createSessionService({ processPort })

    const firstSession = await service.attach({
      columns: 100,
      onExit: () => undefined,
      onGraphUpdated: () => undefined,
      onOutput: () => undefined,
      onToolApprovalRequested: () => undefined,
      projectDirectory: '/repo/app',
      rows: 32,
      workspaceDirectory: '/repo/app',
      workspaceName: 'main'
    })
    const reattachedSession = await service.attach({
      columns: 120,
      onExit: () => undefined,
      onGraphUpdated: () => undefined,
      onOutput: () => undefined,
      onToolApprovalRequested: () => undefined,
      projectDirectory: '/repo/app',
      rows: 40,
      workspaceDirectory: '/repo/app',
      workspaceName: 'main'
    })
    const branchSession = await service.attach({
      columns: 80,
      onExit: () => undefined,
      onGraphUpdated: () => undefined,
      onOutput: () => undefined,
      onToolApprovalRequested: () => undefined,
      projectDirectory: '/repo/app',
      rows: 24,
      workspaceDirectory: '/repo/app-worktrees/feature',
      workspaceName: 'feature'
    })

    expect(reattachedSession.sessionId).toBe(firstSession.sessionId)
    expect(branchSession.sessionId).not.toBe(firstSession.sessionId)
    expect(processPort.starts.map((start) => start.workspaceDirectory)).toEqual([
      '/repo/app',
      '/repo/app-worktrees/feature'
    ])
    expect(processPort.resizes).toEqual([
      { columns: 120, rows: 40, sessionId: firstSession.sessionId }
    ])
  })

  it('keeps separate Codex sessions for different branches in the same workspace', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const service = createSessionService({ processPort })
    const callbacks = {
      onExit: () => undefined,
      onGraphUpdated: () => undefined,
      onOutput: () => undefined,
      onToolApprovalRequested: () => undefined
    }
    const mainBranchCommand = {
      ...callbacks,
      gitBranch: 'main',
      projectDirectory: '/repo/app',
      projectId: 'project-1',
      workspaceDirectory: '/repo/app',
      workspaceName: 'main'
    }
    const featureBranchCommand = {
      ...callbacks,
      gitBranch: 'feature/login',
      projectDirectory: '/repo/app',
      projectId: 'project-1',
      workspaceDirectory: '/repo/app',
      workspaceName: 'main'
    }

    const mainSession = await service.attach(mainBranchCommand)
    const featureSession = await service.attach(featureBranchCommand)

    expect(featureSession.sessionId).not.toBe(mainSession.sessionId)
    expect(processPort.starts).toHaveLength(2)
  })

  it('resumes the persisted Codex thread after the application service is recreated', async () => {
    const repository = new RecordingAgentSessionRepository()
    const firstProcessPort = new RecordingCodexAgentProcessPort()
    const firstService = createSessionService({ processPort: firstProcessPort, repository })
    const command = {
      gitBranch: 'main',
      projectId: 'project-1'
    }

    await attachMainSession(firstService, command)
    firstProcessPort.starts[0]?.onCodexThreadIdentified('0190d8a1-8b7d-7d75-9f62-7a663ef87e33')
    await vi.waitFor(() => expect(repository.sessions.size).toBe(1))

    const restartedProcessPort = new RecordingCodexAgentProcessPort()
    const restartedService = createSessionService({
      processPort: restartedProcessPort,
      repository
    })
    await attachMainSession(restartedService, command)

    expect(restartedProcessPort.starts[0]?.resumeThreadId).toBe(
      '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    )
  })

  it('passes user input and terminal resize to the bound Codex PTY', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const service = createSessionService({ processPort })
    const session = await attachMainSession(service)

    service.write({ input: 'build the app\r', sessionId: session.sessionId })
    service.resize({ columns: 132, rows: 36, sessionId: session.sessionId })

    expect(processPort.writes).toEqual([{ input: 'build the app\r', sessionId: session.sessionId }])
    expect(processPort.resizes).toEqual([{ columns: 132, rows: 36, sessionId: session.sessionId }])
  })

  it('waits for UI approval before executing destructive MCP tools', async () => {
    const approvals: string[] = []
    const executeAgentTool = vi
      .fn<ExecuteAgentTool>()
      .mockResolvedValueOnce({
        approval: { summary: '删除终端积木 terminal-1', toolName: 'delete_block' },
        status: 'awaiting_approval',
        toolCallId: 'approval-1'
      })
      .mockResolvedValueOnce(completedToolResult('approval-1'))
    const service = createSessionService({ executeAgentTool })
    const session = await attachMainSession(service, {
      onToolApprovalRequested: (approval) => approvals.push(approval.approvalId)
    })

    const resultPromise = service.executeMcpTool({
      input: { blockId: 'terminal-1' },
      sessionId: session.sessionId,
      toolName: 'delete_block'
    })
    await vi.waitFor(() => expect(approvals).toEqual(['approval-1']))

    service.approveTool({ approvalId: 'approval-1' })
    await expect(resultPromise).resolves.toEqual(completedToolResult('approval-1'))
    expect(executeAgentTool).toHaveBeenLastCalledWith(
      expect.objectContaining({
        approved: true,
        input: { blockId: 'terminal-1' },
        toolName: 'delete_block'
      })
    )
  })

  it('returns a canceled result when a destructive MCP tool is rejected or its session is disposed', async () => {
    const executeAgentTool = vi.fn<ExecuteAgentTool>(async () => ({
      approval: { summary: '删除组合终端 group-1', toolName: 'delete_terminal_group' },
      status: 'awaiting_approval',
      toolCallId: 'approval-1'
    }))
    const service = createSessionService({ executeAgentTool })
    const session = await attachMainSession(service)
    const rejectedResultPromise = service.executeMcpTool({
      input: { terminalGroupId: 'group-1' },
      sessionId: session.sessionId,
      toolName: 'delete_terminal_group'
    })

    await vi.waitFor(() => expect(service.listPendingApprovals()).toHaveLength(1))
    service.rejectTool({ approvalId: 'approval-1' })
    await expect(rejectedResultPromise).resolves.toMatchObject({
      status: 'canceled',
      toolCallId: 'approval-1'
    })

    const disposedResultPromise = service.executeMcpTool({
      input: { terminalGroupId: 'group-1' },
      sessionId: session.sessionId,
      toolName: 'delete_terminal_group'
    })
    await vi.waitFor(() => expect(service.listPendingApprovals()).toHaveLength(1))
    await service.disposeSession({ projectDirectory: '/repo/app', workspaceName: 'main' })

    await expect(disposedResultPromise).resolves.toMatchObject({
      status: 'canceled',
      toolCallId: 'approval-1'
    })
  })

  it('cancels an approved destructive MCP tool if the session is disposed before execution completes', async () => {
    let resolveApprovedExecution: (result: AgentToolExecutionResult) => void = () => undefined
    const executeAgentTool = vi
      .fn<ExecuteAgentTool>()
      .mockResolvedValueOnce({
        approval: { summary: '删除终端积木 terminal-1', toolName: 'delete_block' },
        status: 'awaiting_approval',
        toolCallId: 'approval-2'
      })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveApprovedExecution = resolve
          })
      )
    const service = createSessionService({ executeAgentTool })
    const session = await attachMainSession(service)
    const resultPromise = service.executeMcpTool({
      input: { blockId: 'terminal-1' },
      sessionId: session.sessionId,
      toolName: 'delete_block'
    })

    await vi.waitFor(() => expect(service.listPendingApprovals()).toHaveLength(1))
    service.approveTool({ approvalId: 'approval-2' })
    await vi.waitFor(() => expect(executeAgentTool).toHaveBeenCalledTimes(2))
    await service.disposeSession({ projectDirectory: '/repo/app', workspaceName: 'main' })
    resolveApprovedExecution(completedToolResult('approval-2'))

    await expect(resultPromise).resolves.toMatchObject({
      status: 'canceled',
      toolCallId: 'approval-2'
    })
  })
})

type ExecuteAgentTool = (command: ExecuteAgentToolCommand) => Promise<AgentToolExecutionResult>

class RecordingCodexAgentProcessPort implements CodexAgentProcessPort {
  readonly resizes: {
    readonly columns: number
    readonly rows: number
    readonly sessionId: string
  }[] = []
  readonly starts: StartCodexAgentProcessCommand[] = []
  readonly stops: string[] = []
  readonly writes: { readonly input: string; readonly sessionId: string }[] = []

  async start(command: StartCodexAgentProcessCommand): Promise<{ readonly processId: number }> {
    this.starts.push(command)
    return { processId: this.starts.length }
  }

  write(sessionId: string, input: string): void {
    this.writes.push({ input, sessionId })
  }

  resize(sessionId: string, columns: number, rows: number): void {
    this.resizes.push({ columns, rows, sessionId })
  }

  async stop(sessionId: string): Promise<void> {
    this.stops.push(sessionId)
  }

  async disposeAll(): Promise<void> {
    this.stops.push('*')
  }
}

class RecordingMcpServerPort implements AgentMcpServerPort {
  readonly sessions = new Map<string, RegisteredAgentMcpSession>()

  async registerSession(session: RegisteredAgentMcpSession): Promise<{
    readonly bearerToken: string
    readonly url: string
  }> {
    this.sessions.set(session.sessionId, session)
    return {
      bearerToken: `token-${session.sessionId}`,
      url: `http://127.0.0.1:3000/mcp/${session.sessionId}`
    }
  }

  unregisterSession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  dispose(): void {
    this.sessions.clear()
  }
}

function createSessionService(
  input: {
    readonly executeAgentTool?: ExecuteAgentTool
    readonly mcpServerPort?: AgentMcpServerPort
    readonly processPort?: CodexAgentProcessPort
    readonly repository?: AgentSessionRepository
  } = {}
): AgentSessionService {
  return new AgentSessionService(
    input.processPort ?? new RecordingCodexAgentProcessPort(),
    input.mcpServerPort ?? new RecordingMcpServerPort(),
    input.executeAgentTool ?? (async () => completedToolResult('tool-call-1')),
    input.repository ?? new RecordingAgentSessionRepository()
  )
}

class RecordingAgentSessionRepository implements AgentSessionRepository {
  readonly sessions = new Map<string, AgentSession>()

  async find(scope: AgentConversationScope): Promise<AgentSession | null> {
    return this.sessions.get(scope.key) ?? null
  }

  async save(session: AgentSession): Promise<void> {
    this.sessions.set(session.scope.key, session)
  }

  async delete(scope: AgentConversationScope): Promise<void> {
    this.sessions.delete(scope.key)
  }

  async deleteProject(projectId: string): Promise<void> {
    for (const [key, session] of this.sessions.entries()) {
      if (session.scope.toSnapshot().projectId === projectId) {
        this.sessions.delete(key)
      }
    }
  }
}

async function attachMainSession(
  service: AgentSessionService,
  input: Partial<Parameters<AgentSessionService['attach']>[0]> = {}
): Promise<Awaited<ReturnType<AgentSessionService['attach']>>> {
  return service.attach({
    columns: 80,
    onExit: () => undefined,
    onGraphUpdated: () => undefined,
    onOutput: () => undefined,
    onToolApprovalRequested: () => undefined,
    projectDirectory: '/repo/app',
    rows: 24,
    workspaceDirectory: '/repo/app',
    workspaceName: 'main',
    ...input
  })
}

function completedToolResult(toolCallId: string): AgentToolExecutionResult {
  return {
    graph: {
      blocks: [],
      id: 'graph-1',
      projectId: 'project-1',
      terminalGroups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      workspaceName: 'main'
    },
    output: { type: 'block_graph' },
    status: 'completed',
    toolCallId
  }
}
