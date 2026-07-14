import { UpdateWorkspaceAgentMcpCapabilityUseCase } from '../../../../src/contexts/agent/application/use-cases/UpdateWorkspaceAgentMcpCapabilityUseCase'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import type { WorkspaceAgentRuntimePort } from '../../../../src/contexts/agent/application/ports/WorkspaceAgentRuntimePort'
import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'

describe('update workspace Agent MCP capability', () => {
  it('persists the desired capability before reconfiguring only the target Agent runtime', async () => {
    const agent = createAgent()
    const repository = new MemoryAgentRepository(agent)
    const runtime = new RecordingWorkspaceAgentRuntime(repository)
    const useCase = new UpdateWorkspaceAgentMcpCapabilityUseCase(repository, runtime)

    const result = await useCase.execute({
      agentId: agent.id,
      cleancodeMcpEnabled: false,
      projectId: agent.projectId,
      workspaceName: agent.workspaceName
    })

    expect(runtime.reconfigured).toEqual([
      {
        agentId: 'agent-1',
        cleancodeMcpEnabled: false,
        projectId: 'project-1',
        workspaceName: 'main'
      }
    ])
    expect(runtime.persistedValuesAtReconfigure).toEqual([false])
    expect(result.agent.cleancodeMcpEnabled).toBe(false)
    expect(result.session).toBeNull()
  })
})

class RecordingWorkspaceAgentRuntime implements WorkspaceAgentRuntimePort {
  readonly persistedValuesAtReconfigure: boolean[] = []
  readonly reconfigured: Parameters<WorkspaceAgentRuntimePort['reconfigureAgent']>[0][] = []

  constructor(private readonly repository: AgentSessionRepository) {}

  async disposeAgent(): Promise<void> {}

  async reconfigureAgent(
    command: Parameters<WorkspaceAgentRuntimePort['reconfigureAgent']>[0]
  ): Promise<null> {
    this.reconfigured.push(command)
    const persisted = await this.repository.findAgent(
      command.projectId,
      command.workspaceName,
      command.agentId
    )
    this.persistedValuesAtReconfigure.push(persisted?.cleancodeMcpEnabled ?? true)
    return null
  }
}

class MemoryAgentRepository implements AgentSessionRepository {
  constructor(private agent: AgentSession) {}

  async find(): Promise<AgentSession | null> {
    return null
  }

  async findAgent(): Promise<AgentSession | null> {
    return AgentSession.fromSnapshot(this.agent.toSnapshot())
  }

  async findWorkspace(): Promise<readonly AgentSession[]> {
    return [AgentSession.fromSnapshot(this.agent.toSnapshot())]
  }

  async save(agent: AgentSession): Promise<void> {
    this.agent = AgentSession.fromSnapshot(agent.toSnapshot())
  }

  async delete(): Promise<void> {}
  async deleteAgent(): Promise<void> {}
  async deleteProject(): Promise<void> {}
}

function createAgent(): AgentSession {
  return AgentSession.create({
    agentId: 'agent-1',
    layout: { position: { x: 540, y: 120 }, size: { width: 720, height: 460 } },
    name: 'Agent 1',
    projectId: 'project-1',
    workspaceName: 'main'
  })
}
