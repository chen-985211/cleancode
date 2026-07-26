import type {
  AgentMcpServerPort,
  RegisteredAgentMcpSession
} from '../../../../src/contexts/agent/application/ports/AgentMcpServerPort'
import {
  RecordingAgentProviderRegistry,
  RecordingAgentTerminalRuntime
} from '../../../fixtures/agentTerminalRuntime'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import type { AgentRuntimeScopeValidationPort } from '../../../../src/contexts/agent/application/ports/AgentRuntimeScopeValidationPort'
import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import type { AgentToolExecutionResult } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import { AgentConversationScope } from '../../../../src/contexts/agent/domain/value-objects/AgentConversationScope'
import { ProviderSessionRef } from '../../../../src/contexts/agent/domain/value-objects/ProviderSessionRef'

describe('reconfigure Agent CleanCode MCP capability', () => {
  it('starts a disabled Agent without registering or injecting the built-in MCP', async () => {
    const repository = new MemoryAgentRepository(createAgent(false))
    const processPort = new RecordingProcessPort()
    const mcpServer = new RecordingMcpServerPort()
    const service = createService(repository, processPort, mcpServer)

    await service.attach(attachCommand())

    expect(mcpServer.registered).toEqual([])
    expect(processPort.providers.launchCommands[0]?.cleancodeMcp).toBeUndefined()
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
      toolCallId: 'approval-1',
      toolName: 'delete_block'
    })
    await vi.waitFor(() => expect(service.listPendingApprovals()).toHaveLength(1))

    const restarted = await service.reconfigureAgent({
      agentId: 'agent-1',
      cleancodeMcpEnabled: false,
      projectId: 'project-1',
      workspaceId: 'main'
    })

    await expect(approval).resolves.toMatchObject({ status: 'canceled' })
    expect(restarted?.sessionId).not.toBe(first.sessionId)
    expect(processPort.stops).toEqual([first.sessionId])
    expect(processPort.launches).toHaveLength(2)
    expect(processPort.providers.launchCommands[1]).toMatchObject({
      providerSessionRef: {
        kind: 'codex-thread',
        value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
      }
    })
    expect(processPort.providers.launchCommands[1]?.cleancodeMcp).toBeUndefined()
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
      workspaceId: 'main'
    })

    processPort.launches[0]?.onExit({ exitCode: 0, generation: 1, launchId: 'launch-1' })
    const reattached = await service.attach(attachCommand())

    expect(reattached.sessionId).toBe(restarted?.sessionId)
    expect(processPort.launches).toHaveLength(2)
  })

  it('does not restart a suspended old-scope session after checkout commits', async () => {
    const processPort = new RecordingProcessPort()
    const service = createService(
      new MemoryAgentRepository(createAgent(true)),
      processPort,
      new RecordingMcpServerPort()
    )
    const attached = await service.attach(attachCommand())
    const suspension = await service.suspendWorkspaceDirectory('/repo/app')
    suspension.resolve()

    await expect(
      service.reconfigureAgent({
        agentId: 'agent-1',
        cleancodeMcpEnabled: false,
        projectId: 'project-1',
        workspaceId: 'main'
      })
    ).resolves.toBeNull()

    expect(processPort.stops).toEqual([attached.sessionId])
    expect(processPort.launches).toHaveLength(1)
  })

  it('validates the complete runtime scope before restarting an active session', async () => {
    let isValid = true
    const scopeValidation = {
      isValid: vi.fn(async () => isValid)
    } satisfies AgentRuntimeScopeValidationPort
    const processPort = new RecordingProcessPort()
    const service = createService(
      new MemoryAgentRepository(createAgent(true)),
      processPort,
      new RecordingMcpServerPort(),
      scopeValidation
    )
    await service.attach(attachCommand())
    isValid = false

    await expect(
      service.reconfigureAgent({
        agentId: 'agent-1',
        cleancodeMcpEnabled: false,
        projectId: 'project-1',
        workspaceId: 'main'
      })
    ).rejects.toMatchObject({ code: 'AGENT_SESSION_NOT_FOUND' })

    expect(scopeValidation.isValid).toHaveBeenLastCalledWith({
      agentId: 'agent-1',
      projectDirectory: '/repo/app',
      projectId: 'project-1',
      workspaceDirectory: '/repo/app',
      workspaceId: 'main'
    })
    expect(processPort.stops).toEqual([])
    expect(processPort.launches).toHaveLength(1)
  })
})

class RecordingProcessPort extends RecordingAgentTerminalRuntime {
  readonly providers = new RecordingAgentProviderRegistry()
}

class RecordingMcpServerPort implements AgentMcpServerPort {
  readonly registered: string[] = []
  readonly unregistered: string[] = []

  async registerSession(session: RegisteredAgentMcpSession) {
    this.registered.push(session.sessionId)
    return {
      bearerToken: `token-${session.sessionId}`,
      dispose: () => this.unregistered.push(session.sessionId),
      url: `http://127.0.0.1:43123/mcp/${session.sessionId}`
    }
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
  processPort: RecordingProcessPort,
  mcpServer: AgentMcpServerPort,
  scopeValidation?: AgentRuntimeScopeValidationPort
): AgentSessionService {
  return new AgentSessionService(
    processPort,
    mcpServer,
    {
      cancel: async (command, reason): Promise<AgentToolExecutionResult> => ({
        output: { reason, type: 'tool_canceled' },
        status: 'canceled',
        toolCallId: command.toolCallId
      }),
      execute: async (): Promise<AgentToolExecutionResult> => ({
        approval: {
          summary: '删除终端积木 terminal-1',
          target: { blockId: 'terminal-1', kind: 'terminal_block' },
          toolName: 'delete_block'
        },
        status: 'awaiting_approval',
        toolCallId: 'approval-1'
      })
    },
    repository,
    processPort.providers,
    'codex',
    scopeValidation
  )
}

function createAgent(enabled: boolean, withThread = false): AgentSession {
  const agent = AgentSession.create({
    agentId: 'agent-1',
    cleancodeMcpEnabled: enabled,
    layout: { position: { x: 540, y: 120 }, size: { width: 720, height: 460 } },
    name: 'Agent 1',
    projectId: 'project-1',
    providerId: 'codex',
    workspaceId: 'main'
  })
  if (withThread) {
    agent.bindProviderSession(
      AgentConversationScope.create({
        agentId: 'agent-1',
        projectId: 'project-1',
        workspaceId: 'main'
      }),
      ProviderSessionRef.create({
        formatVersion: 1,
        kind: 'codex-thread',
        value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
      })
    )
  }
  return agent
}

function attachCommand() {
  return {
    agentId: 'agent-1',
    onGraphUpdated: () => undefined,
    onRuntimeChanged: () => undefined,
    onToolApprovalRequested: () => undefined,
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    terminalSourceTheme: 'light' as const,
    workspaceDirectory: '/repo/app',
    workspaceId: 'main'
  }
}
