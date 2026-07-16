import type {
  AgentMcpServerPort,
  RegisteredAgentMcpSession
} from '../../../../src/contexts/agent/application/ports/AgentMcpServerPort'
import type {
  CodexAgentProcessPort,
  StartCodexAgentProcessCommand
} from '../../../../src/contexts/agent/application/ports/CodexAgentProcessPort'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import type { AgentToolExecutionResult } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import { AgentConversationScope } from '../../../../src/contexts/agent/domain/value-objects/AgentConversationScope'
import { CodexThreadId } from '../../../../src/contexts/agent/domain/value-objects/CodexThreadId'

describe('reconfigure Agent CleanCode MCP capability', () => {
  it('starts a disabled Agent without registering or injecting the built-in MCP', async () => {
    const repository = new MemoryAgentRepository(createAgent(false))
    const processPort = new RecordingProcessPort()
    const mcpServer = new RecordingMcpServerPort()
    const service = createService(repository, processPort, mcpServer)

    await service.attach(attachCommand())

    expect(mcpServer.registered).toEqual([])
    expect(processPort.starts[0]?.cleancodeMcp).toBeUndefined()
  })

  it('cancels approvals and restarts only the target Agent on its original thread when disabled', async () => {
    const repository = new MemoryAgentRepository(createAgent(true, true))
    const processPort = new RecordingProcessPort()
    const mcpServer = new RecordingMcpServerPort()
    const service = createService(repository, processPort, mcpServer)
    const first = await service.attach(attachCommand())
    const approval = service.executeMcpTool({
      input: { blockId: 'terminal-1' },
      sessionId: first.sessionId,
      toolName: 'delete_block'
    })
    await vi.waitFor(() => expect(service.listPendingApprovals()).toHaveLength(1))

    const restarted = await service.reconfigureAgent({
      agentId: 'agent-1',
      cleancodeMcpEnabled: false,
      projectId: 'project-1',
      workspaceName: 'main'
    })

    await expect(approval).resolves.toMatchObject({ status: 'canceled' })
    expect(restarted?.sessionId).not.toBe(first.sessionId)
    expect(processPort.stops).toEqual([first.sessionId])
    expect(processPort.starts).toHaveLength(2)
    expect(processPort.starts[1]).toMatchObject({
      resumeThreadId: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
    expect(processPort.starts[1]?.cleancodeMcp).toBeUndefined()
    expect(mcpServer.unregistered).toEqual([first.sessionId])
    expect(service.listPendingApprovals()).toEqual([])
  })

  it('ignores a late exit callback from the replaced PTY generation', async () => {
    const repository = new MemoryAgentRepository(createAgent(true))
    const processPort = new RecordingProcessPort()
    const service = createService(repository, processPort, new RecordingMcpServerPort())
    await service.attach(attachCommand())
    const restarted = await service.reconfigureAgent({
      agentId: 'agent-1',
      cleancodeMcpEnabled: false,
      projectId: 'project-1',
      workspaceName: 'main'
    })

    processPort.starts[0]?.onExit({ exitCode: 0, sessionId: processPort.starts[0].sessionId })
    const reattached = await service.attach(attachCommand())

    expect(reattached.sessionId).toBe(restarted?.sessionId)
    expect(processPort.starts).toHaveLength(2)
  })
})

class RecordingProcessPort implements CodexAgentProcessPort {
  readonly starts: StartCodexAgentProcessCommand[] = []
  readonly stops: string[] = []

  async start(command: StartCodexAgentProcessCommand): Promise<{ readonly processId: number }> {
    this.starts.push(command)
    return { processId: this.starts.length }
  }

  write(): void {}
  resize(): void {}

  async stop(sessionId: string): Promise<void> {
    this.stops.push(sessionId)
  }

  async disposeAll(): Promise<void> {}
}

class RecordingMcpServerPort implements AgentMcpServerPort {
  readonly registered: string[] = []
  readonly unregistered: string[] = []

  async registerSession(session: RegisteredAgentMcpSession) {
    this.registered.push(session.sessionId)
    return {
      bearerToken: `token-${session.sessionId}`,
      url: `http://127.0.0.1:43123/mcp/${session.sessionId}`
    }
  }

  unregisterSession(sessionId: string): void {
    this.unregistered.push(sessionId)
  }

  dispose(): void {}
}

class MemoryAgentRepository implements AgentSessionRepository {
  constructor(private readonly agent: AgentSession) {}

  async find(scope: AgentConversationScope): Promise<AgentSession | null> {
    return AgentSession.fromSnapshot(this.agent.toSnapshot(), scope)
  }

  async findAgent(): Promise<AgentSession | null> {
    return AgentSession.fromSnapshot(this.agent.toSnapshot())
  }

  async findWorkspace(): Promise<readonly AgentSession[]> {
    return [AgentSession.fromSnapshot(this.agent.toSnapshot())]
  }

  async save(): Promise<void> {}
  async delete(): Promise<void> {}
  async deleteAgent(): Promise<void> {}
  async deleteProject(): Promise<void> {}
}

function createService(
  repository: AgentSessionRepository,
  processPort: CodexAgentProcessPort,
  mcpServer: AgentMcpServerPort
): AgentSessionService {
  return new AgentSessionService(
    processPort,
    mcpServer,
    async (): Promise<AgentToolExecutionResult> => ({
      approval: {
        summary: '删除终端积木 terminal-1',
        target: { blockId: 'terminal-1', kind: 'terminal_block' },
        toolName: 'delete_block'
      },
      status: 'awaiting_approval',
      toolCallId: 'approval-1'
    }),
    repository
  )
}

function createAgent(enabled: boolean, withThread = false): AgentSession {
  const agent = AgentSession.create({
    agentId: 'agent-1',
    cleancodeMcpEnabled: enabled,
    layout: { position: { x: 540, y: 120 }, size: { width: 720, height: 460 } },
    name: 'Agent 1',
    projectId: 'project-1',
    workspaceName: 'main'
  })
  if (withThread) {
    agent.bindCodexThread(
      AgentConversationScope.create({
        agentId: 'agent-1',
        gitBranch: null,
        projectId: 'project-1',
        workspaceName: 'main'
      }),
      CodexThreadId.create('0190d8a1-8b7d-7d75-9f62-7a663ef87e33')
    )
  }
  return agent
}

function attachCommand() {
  return {
    agentId: 'agent-1',
    onExit: () => undefined,
    onGraphUpdated: () => undefined,
    onOutput: () => undefined,
    onToolApprovalRequested: () => undefined,
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    workspaceDirectory: '/repo/app',
    workspaceName: 'main'
  }
}
