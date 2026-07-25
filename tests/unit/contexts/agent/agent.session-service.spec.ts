import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import type {
  AgentMcpRegistration,
  AgentMcpServerPort,
  RegisteredAgentMcpSession
} from '../../../../src/contexts/agent/application/ports/AgentMcpServerPort'
import {
  RecordingAgentProviderRegistry,
  RecordingAgentTerminalRuntime
} from '../../../fixtures/agentTerminalRuntime'
import type { AgentToolExecutionResult } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import type { ExecuteAgentToolCommand } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import type { AgentConversationScope } from '../../../../src/contexts/agent/domain/value-objects/AgentConversationScope'
import type { AgentToolApprovalRequest } from '../../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type { BlockGraphSnapshot } from '../../../../src/contexts/block-graph/application/dto/BlockGraphSnapshot'

describe('agent session service', () => {
  it('keeps one background Codex PTY per workspace and reattaches without restarting it', async () => {
    const processPort = new RecordingAgentTerminalRuntime()
    const service = createSessionService({ processPort })

    const firstSession = await service.attach({
      agentId: 'agent-1',
      columns: 100,
      onGraphUpdated: () => undefined,
      onRuntimeChanged: () => undefined,
      onToolApprovalRequested: () => undefined,
      projectDirectory: '/repo/app',
      rows: 32,
      terminalSourceTheme: 'light',
      workspaceDirectory: '/repo/app',
      workspaceName: 'main'
    })
    const reattachedSession = await service.attach({
      agentId: 'agent-1',
      columns: 120,
      onGraphUpdated: () => undefined,
      onRuntimeChanged: () => undefined,
      onToolApprovalRequested: () => undefined,
      projectDirectory: '/repo/app',
      rows: 40,
      terminalSourceTheme: 'dark',
      workspaceDirectory: '/repo/app',
      workspaceName: 'main'
    })
    const branchSession = await service.attach({
      agentId: 'agent-2',
      columns: 80,
      onGraphUpdated: () => undefined,
      onRuntimeChanged: () => undefined,
      onToolApprovalRequested: () => undefined,
      projectDirectory: '/repo/app',
      rows: 24,
      terminalSourceTheme: 'light',
      workspaceDirectory: '/repo/app-worktrees/feature',
      workspaceName: 'feature'
    })

    expect(reattachedSession.sessionId).toBe(firstSession.sessionId)
    expect(branchSession.sessionId).not.toBe(firstSession.sessionId)
    expect(processPort.opens.map((start) => start.workspaceDirectory)).toEqual([
      '/repo/app',
      '/repo/app-worktrees/feature'
    ])
    expect(processPort.resizes).toEqual([
      { columns: 120, rows: 40, sessionId: firstSession.sessionId }
    ])
  })

  it('runs multiple Agents in the same workspace without stopping each other', async () => {
    const processPort = new RecordingAgentTerminalRuntime()
    const service = createSessionService({ processPort })

    const first = await attachMainSession(service, { agentId: 'agent-1' })
    const second = await attachMainSession(service, { agentId: 'agent-2' })

    expect(first.agentId).toBe('agent-1')
    expect(second.agentId).toBe('agent-2')
    expect(processPort.launches).toHaveLength(2)
    expect(processPort.stops).toEqual([])
  })

  it('rejects attempts to attach an existing Agent with a different Provider', async () => {
    const repository = new RecordingAgentSessionRepository()
    await repository.save(
      AgentSession.create({
        agentId: 'agent-1',
        layout: { position: { x: 540, y: 120 }, size: { height: 460, width: 720 } },
        name: 'Agent 1',
        projectId: 'project-1',
        providerId: 'claude-code',
        workspaceName: 'main'
      })
    )
    const service = createSessionService({ repository })

    await expect(attachMainSession(service, { providerId: 'codex' })).rejects.toMatchObject({
      code: 'AGENT_PROVIDER_MISMATCH'
    })
  })

  it('does not launch a Provider whose installed CLI is below its compatibility floor', async () => {
    const processPort = new RecordingAgentTerminalRuntime()
    const providers = new RecordingAgentProviderRegistry()
    vi.spyOn(providers.contribution.detector, 'inspect').mockResolvedValue({
      installCommand: 'install codex',
      minimumVersion: '0.143.0',
      providerId: 'codex',
      status: 'upgrade_required',
      version: 'codex-cli 0.142.9'
    })
    const service = createSessionService({ processPort, providers })

    const session = await attachMainSession(service)

    expect(processPort.opens).toHaveLength(1)
    expect(processPort.launches).toHaveLength(0)
    expect(session.runtime.terminal.status).toBe('running')
    expect(session.runtime.launch).toMatchObject({ failureKind: 'start', status: 'failed' })
  })

  it('accepts structured activity only from the current Provider launch', async () => {
    const processPort = new RecordingAgentTerminalRuntime()
    const providers = new RecordingAgentProviderRegistry()
    const service = createSessionService({ processPort, providers })
    const onRuntimeChanged = vi.fn()
    const session = await attachMainSession(service, { onRuntimeChanged })

    providers.launchCommands[0]?.onActivityChanged?.('working')

    expect(onRuntimeChanged).toHaveBeenCalledWith({
      agentId: 'agent-1',
      runtime: expect.objectContaining({ activity: { status: 'working' } }),
      sessionId: session.sessionId
    })
    expect((await attachMainSession(service, { onRuntimeChanged })).runtime.activity.status).toBe(
      'working'
    )

    processPort.launches[0]?.onExit({ exitCode: 0, generation: 1, launchId: 'launch-1' })

    expect(onRuntimeChanged).toHaveBeenLastCalledWith({
      agentId: 'agent-1',
      runtime: expect.objectContaining({ activity: { status: 'unavailable' } }),
      sessionId: session.sessionId
    })

    await attachMainSession(service, { onRuntimeChanged, restartMode: 'retry' })
    providers.launchCommands[0]?.onActivityChanged?.('working')
    expect(onRuntimeChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({
        runtime: expect.objectContaining({ activity: { status: 'unavailable' } })
      })
    )

    providers.launchCommands[1]?.onActivityChanged?.('idle')
    expect(onRuntimeChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({
        runtime: expect.objectContaining({ activity: { status: 'idle' } })
      })
    )
  })

  it('suspends and resumes every Agent in a physical workspace directory', async () => {
    const processPort = new RecordingAgentTerminalRuntime()
    const service = createSessionService({ processPort })
    const first = await attachMainSession(service, { agentId: 'agent-1' })
    const second = await attachMainSession(service, { agentId: 'agent-2' })

    const suspension = await service.suspendWorkspaceDirectory('/repo/app')
    expect(suspension.wasSuspended).toBe(true)
    expect(processPort.stops).toEqual([first.sessionId, second.sessionId])

    await suspension.resume()
    suspension.release()
    expect(processPort.launches).toHaveLength(4)
  })

  it('ignores a stale resize emitted after its Agent session has been disposed', async () => {
    const processPort = new RecordingAgentTerminalRuntime()
    const service = createSessionService({ processPort })
    const session = await attachMainSession(service)

    const lease = await service.disposeAgent({
      agentId: 'agent-1',
      projectId: 'project-1',
      workspaceName: 'main'
    })
    lease.release()
    service.resize({ columns: 120, rows: 36, sessionId: session.sessionId })

    expect(processPort.resizes).toEqual([])
  })

  it('keeps separate Codex sessions for different branches in the same workspace', async () => {
    const processPort = new RecordingAgentTerminalRuntime()
    const service = createSessionService({ processPort })
    const callbacks = {
      onGraphUpdated: () => undefined,
      onRuntimeChanged: () => undefined,
      onToolApprovalRequested: () => undefined
    }
    const mainBranchCommand = {
      ...callbacks,
      agentId: 'agent-1',
      gitBranch: 'main',
      projectDirectory: '/repo/app',
      projectId: 'project-1',
      terminalSourceTheme: 'light' as const,
      workspaceDirectory: '/repo/app',
      workspaceName: 'main'
    }
    const featureBranchCommand = {
      ...callbacks,
      agentId: 'agent-1',
      gitBranch: 'feature/login',
      projectDirectory: '/repo/app',
      projectId: 'project-1',
      terminalSourceTheme: 'light' as const,
      workspaceDirectory: '/repo/app',
      workspaceName: 'main'
    }

    const mainSession = await service.attach(mainBranchCommand)
    const featureSession = await service.attach(featureBranchCommand)

    expect(featureSession.sessionId).not.toBe(mainSession.sessionId)
    expect(processPort.launches).toHaveLength(2)
  })

  it('resumes the persisted Codex thread after the application service is recreated', async () => {
    const repository = new RecordingAgentSessionRepository()
    const firstProcessPort = new RecordingAgentTerminalRuntime()
    const firstProviders = new RecordingAgentProviderRegistry()
    const firstService = createSessionService({
      processPort: firstProcessPort,
      providers: firstProviders,
      repository
    })
    const command = {
      gitBranch: 'main',
      projectId: 'project-1'
    }

    await attachMainSession(firstService, command)
    firstProviders.launchCommands[0]?.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
    await vi.waitFor(() => expect(repository.sessions.size).toBe(1))

    const restartedProcessPort = new RecordingAgentTerminalRuntime()
    const restartedProviders = new RecordingAgentProviderRegistry()
    const restartedService = createSessionService({
      processPort: restartedProcessPort,
      providers: restartedProviders,
      repository
    })
    await attachMainSession(restartedService, command)

    expect(restartedProviders.launchCommands[0]?.providerSessionRef).toMatchObject({
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
  })

  it('persists a client-assigned Provider session only after its launch starts', async () => {
    const repository = new RecordingAgentSessionRepository()
    const save = vi.spyOn(repository, 'save')
    const processPort = new DeferredStartedAgentTerminalRuntime()
    const providers = new RecordingAgentProviderRegistry('gemini')
    vi.spyOn(providers.contribution.launcher, 'createLaunchPlan').mockResolvedValue({
      args: ['--session-id', '550e8400-e29b-41d4-a716-446655440000'],
      env: {},
      executable: 'gemini',
      providerSessionRefOnStarted: {
        formatVersion: 1,
        kind: 'gemini-session',
        value: '550e8400-e29b-41d4-a716-446655440000'
      }
    })
    const service = createSessionService({ processPort, providers, repository })

    await attachMainSession(service, { providerId: 'gemini' })

    expect(repository.sessions.size).toBe(0)
    processPort.startLatestLaunch()
    await vi.waitFor(() => expect(repository.sessions.size).toBe(1))
    processPort.startLatestLaunch()

    const persisted = await repository.findAgent('project-1', 'main', 'agent-1')
    expect(persisted?.findProviderSessionRef(null)?.toSnapshot()).toEqual({
      formatVersion: 1,
      kind: 'gemini-session',
      value: '550e8400-e29b-41d4-a716-446655440000'
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('passes user input and terminal resize to the bound Codex PTY', async () => {
    const processPort = new RecordingAgentTerminalRuntime()
    const service = createSessionService({ processPort })
    const session = await attachMainSession(service)

    service.write({ input: 'build the app\r', sessionId: session.sessionId })
    service.resize({ columns: 132, rows: 36, sessionId: session.sessionId })

    expect(processPort.writes).toEqual([{ input: 'build the app\r', sessionId: session.sessionId }])
    expect(processPort.resizes).toEqual([{ columns: 132, rows: 36, sessionId: session.sessionId }])
  })

  it('does not revive a terminal that exits before open returns its handle', async () => {
    const processPort = new SynchronouslyExitingAgentTerminalRuntime()
    const service = createSessionService({ processPort })

    const session = await attachMainSession(service)

    expect(session.runtime.terminal).toMatchObject({
      exitCode: 9,
      processId: null,
      status: 'exited',
      viewIdentity: null
    })
    expect(session.runtime.launch.status).toBe('not_started')
    expect(processPort.launches).toEqual([])
  })

  it('isolates runtime observers from terminal and Provider lifecycle transitions', async () => {
    const processPort = new RecordingAgentTerminalRuntime()
    const service = createSessionService({ processPort })

    const session = await attachMainSession(service, {
      onRuntimeChanged: () => {
        throw new Error('renderer observer failed')
      }
    })

    expect(session.runtime).toMatchObject({
      launch: { status: 'running' },
      terminal: { processId: 1, status: 'running' }
    })
    expect(processPort.launches).toHaveLength(1)
    expect(() =>
      processPort.launches[0]?.onExit({ exitCode: 0, generation: 1, launchId: 'launch-1' })
    ).not.toThrow()
    expect((await attachMainSession(service)).runtime).toMatchObject({
      launch: { exitCode: 0, status: 'exited' },
      terminal: { processId: 1, status: 'running' }
    })
  })

  it('projects and strictly matches the launch identity returned by the Run runtime', async () => {
    const processPort = new NonSequentialLaunchIdentityRuntime()
    const service = createSessionService({ processPort })

    const session = await attachMainSession(service)

    expect(session.runtime.launch).toMatchObject({
      generation: 41,
      launchId: 'run-launch-41',
      status: 'running'
    })

    processPort.launches[0]?.onExit({
      exitCode: 9,
      generation: 40,
      launchId: 'run-launch-41'
    })

    expect((await attachMainSession(service)).runtime.launch).toMatchObject({
      exitCode: null,
      generation: 41,
      launchId: 'run-launch-41',
      status: 'running'
    })
  })

  it('keeps the Agent terminal after Provider exit and relaunches in the same shell', async () => {
    const processPort = new RecordingAgentTerminalRuntime()
    const service = createSessionService({ processPort })
    const first = await attachMainSession(service)

    processPort.launches[0]?.onExit({ exitCode: 0, generation: 1, launchId: 'launch-1' })
    const shellAttachment = await attachMainSession(service)

    expect(shellAttachment).toMatchObject({
      runtime: {
        launch: {
          exitCode: 0,
          generation: 1,
          launchId: 'launch-1',
          status: 'exited'
        },
        terminal: { status: 'running' }
      },
      sessionId: first.sessionId
    })
    expect(processPort.opens).toHaveLength(1)
    service.write({ input: 'pwd\r', sessionId: first.sessionId })
    expect(processPort.writes).toContainEqual({ input: 'pwd\r', sessionId: first.sessionId })

    const relaunched = await attachMainSession(service, { restartMode: 'retry' })

    expect(relaunched.sessionId).toBe(first.sessionId)
    expect(relaunched.runtime).toMatchObject({
      launch: { generation: 2, launchId: 'launch-2', status: 'running' },
      terminal: { status: 'running' }
    })
    expect(processPort.opens).toHaveLength(1)
    expect(processPort.launches).toHaveLength(2)
  })

  it('waits for UI approval before executing destructive MCP tools', async () => {
    const approvals: AgentToolApprovalRequest[] = []
    const executeAgentTool = vi
      .fn<ExecuteAgentTool>()
      .mockResolvedValueOnce({
        approval: {
          summary: '删除终端积木 terminal-1',
          target: { blockId: 'terminal-1', kind: 'terminal_block' },
          toolName: 'delete_block'
        },
        status: 'awaiting_approval',
        toolCallId: 'approval-1'
      })
      .mockResolvedValueOnce(completedToolResult('approval-1'))
    const service = createSessionService({ executeAgentTool })
    const session = await attachMainSession(service, {
      onToolApprovalRequested: (approval) => approvals.push(approval)
    })

    const resultPromise = service.executeMcpTool({
      input: { blockId: 'terminal-1' },
      sessionId: session.sessionId,
      toolCallId: 'approval-1',
      toolName: 'delete_block'
    })
    await vi.waitFor(() =>
      expect(approvals).toEqual([
        expect.objectContaining({
          approvalId: 'approval-1',
          target: { blockId: 'terminal-1', kind: 'terminal_block' }
        })
      ])
    )

    const approvalResult = service.approveTool({ approvalId: 'approval-1' })
    await expect(approvalResult).resolves.toEqual({
      graph: completedToolResult('approval-1').graph,
      status: 'completed'
    })
    await expect(resultPromise).resolves.toEqual(completedToolResult('approval-1'))
    expect(executeAgentTool).toHaveBeenLastCalledWith(
      expect.objectContaining({
        approved: true,
        input: { blockId: 'terminal-1' },
        toolCallId: 'approval-1',
        toolName: 'delete_block'
      })
    )
  })

  it('returns a canceled result when a destructive MCP tool is rejected or its session is disposed', async () => {
    const executeAgentTool = vi.fn<ExecuteAgentTool>(async () => ({
      approval: {
        summary: '删除组合终端 group-1',
        target: { kind: 'terminal_group', terminalGroupId: 'group-1' },
        toolName: 'delete_terminal_group'
      },
      status: 'awaiting_approval',
      toolCallId: 'approval-1'
    }))
    const service = createSessionService({ executeAgentTool })
    const session = await attachMainSession(service)
    const rejectedResultPromise = service.executeMcpTool({
      input: { terminalGroupId: 'group-1' },
      sessionId: session.sessionId,
      toolCallId: 'approval-1',
      toolName: 'delete_terminal_group'
    })

    await vi.waitFor(() => expect(service.listPendingApprovals()).toHaveLength(1))
    await service.rejectTool({ approvalId: 'approval-1' })
    await expect(rejectedResultPromise).resolves.toMatchObject({
      status: 'canceled',
      toolCallId: 'approval-1'
    })

    const disposedResultPromise = service.executeMcpTool({
      input: { terminalGroupId: 'group-1' },
      sessionId: session.sessionId,
      toolCallId: 'approval-1',
      toolName: 'delete_terminal_group'
    })
    await vi.waitFor(() => expect(service.listPendingApprovals()).toHaveLength(1))
    const lease = await service.disposeSession({
      projectDirectory: '/repo/app',
      workspaceName: 'main'
    })
    lease.release()

    await expect(disposedResultPromise).resolves.toMatchObject({
      status: 'canceled',
      toolCallId: 'approval-1'
    })
  })
})

type ExecuteAgentTool = (command: ExecuteAgentToolCommand) => Promise<AgentToolExecutionResult>
type CancelAgentTool = (
  command: ExecuteAgentToolCommand,
  reason: string
) => Promise<AgentToolExecutionResult>

class RecordingMcpServerPort implements AgentMcpServerPort {
  readonly sessions = new Map<string, RegisteredAgentMcpSession>()

  async registerSession(session: RegisteredAgentMcpSession): Promise<AgentMcpRegistration> {
    this.sessions.set(session.sessionId, session)
    return {
      bearerToken: `token-${session.sessionId}`,
      dispose: () => this.sessions.delete(session.sessionId),
      url: `http://127.0.0.1:3000/mcp/${session.sessionId}`
    }
  }

  dispose(): void {
    this.sessions.clear()
  }
}

class SynchronouslyExitingAgentTerminalRuntime extends RecordingAgentTerminalRuntime {
  override async open(command: Parameters<RecordingAgentTerminalRuntime['open']>[0]) {
    const handle = await super.open(command)
    command.onTerminalExit(9)
    return handle
  }
}

class NonSequentialLaunchIdentityRuntime extends RecordingAgentTerminalRuntime {
  override launch(command: Parameters<RecordingAgentTerminalRuntime['launch']>[0]) {
    this.launches.push(command)
    const identity = { generation: 41, launchId: 'run-launch-41' }
    command.onStarted?.(identity)
    return identity
  }
}

class DeferredStartedAgentTerminalRuntime extends RecordingAgentTerminalRuntime {
  override launch(command: Parameters<RecordingAgentTerminalRuntime['launch']>[0]) {
    this.launches.push(command)
    return { generation: 1, launchId: 'launch-1' }
  }

  startLatestLaunch(): void {
    this.launches.at(-1)?.onStarted?.({ generation: 1, launchId: 'launch-1' })
  }
}

function createSessionService(
  input: {
    readonly executeAgentTool?: ExecuteAgentTool
    readonly cancelAgentTool?: CancelAgentTool
    readonly mcpServerPort?: AgentMcpServerPort
    readonly processPort?: RecordingAgentTerminalRuntime
    readonly providers?: RecordingAgentProviderRegistry
    readonly repository?: AgentSessionRepository
  } = {}
): AgentSessionService {
  return new AgentSessionService(
    input.processPort ?? new RecordingAgentTerminalRuntime(),
    input.mcpServerPort ?? new RecordingMcpServerPort(),
    {
      cancel:
        input.cancelAgentTool ??
        (async (command, reason) => ({
          output: { reason, type: 'tool_canceled' },
          status: 'canceled',
          toolCallId: command.toolCallId
        })),
      execute: input.executeAgentTool ?? (async () => completedToolResult('tool-call-1'))
    },
    input.repository ?? new RecordingAgentSessionRepository(),
    input.providers ?? new RecordingAgentProviderRegistry(),
    'codex'
  )
}

class RecordingAgentSessionRepository implements AgentSessionRepository {
  readonly sessions = new Map<string, AgentSession>()

  async find(scope: AgentConversationScope): Promise<AgentSession | null> {
    const snapshot = scope.toSnapshot()
    const agent = this.sessions.get(
      agentKey(snapshot.projectId, snapshot.workspaceName, snapshot.agentId)
    )
    return agent ? AgentSession.fromSnapshot(agent.toSnapshot(), scope) : null
  }

  async findAgent(
    projectId: string,
    workspaceName: string,
    agentId: string
  ): Promise<AgentSession | null> {
    return this.sessions.get(agentKey(projectId, workspaceName, agentId)) ?? null
  }

  async findWorkspace(projectId: string, workspaceName: string): Promise<readonly AgentSession[]> {
    return [...this.sessions.values()].filter(
      (agent) => agent.projectId === projectId && agent.workspaceName === workspaceName
    )
  }

  async save(session: AgentSession): Promise<void> {
    this.sessions.set(agentKey(session.projectId, session.workspaceName, session.id), session)
  }

  async delete(scope: AgentConversationScope): Promise<void> {
    const session = await this.find(scope)
    if (session) {
      session.clearProviderSession(scope.toSnapshot().gitBranch)
      await this.save(session)
    }
  }

  async deleteAgent(projectId: string, workspaceName: string, agentId: string): Promise<void> {
    this.sessions.delete(agentKey(projectId, workspaceName, agentId))
  }

  async deleteProject(projectId: string): Promise<void> {
    for (const [key, session] of this.sessions.entries()) {
      if (session.projectId === projectId) {
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
    agentId: 'agent-1',
    columns: 80,
    onGraphUpdated: () => undefined,
    onRuntimeChanged: () => undefined,
    onToolApprovalRequested: () => undefined,
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    rows: 24,
    terminalSourceTheme: 'light',
    workspaceDirectory: '/repo/app',
    workspaceName: 'main',
    ...input
  })
}

function agentKey(projectId: string, workspaceName: string, agentId: string): string {
  return JSON.stringify([projectId, workspaceName, agentId])
}

function completedToolResult(
  toolCallId: string
): Extract<
  AgentToolExecutionResult,
  { readonly graph: BlockGraphSnapshot; readonly status: 'completed' }
> {
  return {
    graph: {
      blocks: [],
      id: 'graph-1',
      projectId: 'project-1',
      terminalGroups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      workspaceName: 'main'
    },
    graphChanged: true,
    output: { type: 'block_graph' },
    status: 'completed',
    toolCallId
  }
}
