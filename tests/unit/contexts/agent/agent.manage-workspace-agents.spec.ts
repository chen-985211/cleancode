import { CreateWorkspaceAgentUseCase } from '../../../../src/contexts/agent/application/use-cases/CreateWorkspaceAgentUseCase'
import { ListWorkspaceAgentsUseCase } from '../../../../src/contexts/agent/application/use-cases/ListWorkspaceAgentsUseCase'
import { RemoveWorkspaceAgentUseCase } from '../../../../src/contexts/agent/application/use-cases/RemoveWorkspaceAgentUseCase'
import { RenameWorkspaceAgentUseCase } from '../../../../src/contexts/agent/application/use-cases/RenameWorkspaceAgentUseCase'
import { UpdateWorkspaceAgentLayoutUseCase } from '../../../../src/contexts/agent/application/use-cases/UpdateWorkspaceAgentLayoutUseCase'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import type { WorkspaceAgentRuntimePort } from '../../../../src/contexts/agent/application/ports/WorkspaceAgentRuntimePort'
import type { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import type { AgentConversationScope } from '../../../../src/contexts/agent/domain/value-objects/AgentConversationScope'

describe('manage workspace Agents', () => {
  it('creates one default Agent only when a workspace is first initialized', async () => {
    const repository = new MemoryAgentRepository()
    const useCase = new ListWorkspaceAgentsUseCase(repository)

    const first = await useCase.execute({ projectId: 'project-1', workspaceName: 'main' })
    await repository.deleteAgent('project-1', 'main', first[0]!.agentId)
    const reopened = await useCase.execute({ projectId: 'project-1', workspaceName: 'main' })

    expect(first).toHaveLength(1)
    expect(first[0]?.name).toBe('Agent 1')
    expect(first[0]?.layout).toEqual({
      position: { x: 540, y: 120 },
      size: { width: 720, height: 460 }
    })
    expect(reopened).toEqual([])
  })

  it('creates, renames, lays out, and removes one Agent without affecting its sibling', async () => {
    const repository = new MemoryAgentRepository()
    const runtime = new RecordingWorkspaceAgentRuntime()
    const list = new ListWorkspaceAgentsUseCase(repository)
    const create = new CreateWorkspaceAgentUseCase(repository)
    const rename = new RenameWorkspaceAgentUseCase(repository)
    const updateLayout = new UpdateWorkspaceAgentLayoutUseCase(repository)
    const remove = new RemoveWorkspaceAgentUseCase(repository, runtime)
    const [first] = await list.execute({ projectId: 'project-1', workspaceName: 'main' })
    const second = await create.execute({
      agentId: 'agent-2',
      layout: { position: { x: 620, y: 160 }, size: { width: 440, height: 520 } },
      projectId: 'project-1',
      providerId: 'claude-code',
      workspaceName: 'main'
    })

    await rename.execute({
      agentId: second.agentId,
      name: 'Review Agent',
      projectId: 'project-1',
      workspaceName: 'main'
    })
    await updateLayout.execute({
      agentId: second.agentId,
      layout: { position: { x: 700, y: 220 }, size: { width: 520, height: 460 } },
      projectId: 'project-1',
      workspaceName: 'main'
    })
    const remaining = await remove.execute({
      agentId: first!.agentId,
      projectId: 'project-1',
      workspaceName: 'main'
    })

    expect(runtime.disposed).toEqual([first!.agentId])
    expect(runtime.released).toEqual([first!.agentId])
    expect(remaining).toEqual([
      expect.objectContaining({
        agentId: 'agent-2',
        layout: { position: { x: 700, y: 220 }, size: { width: 520, height: 460 } },
        name: 'Review Agent',
        providerId: 'claude-code'
      })
    ])
  })

  it('reads the remaining Agents before deleting so a read failure leaves the definition intact', async () => {
    const repository = new MemoryAgentRepository()
    const runtime = new RecordingWorkspaceAgentRuntime()
    const deleteAgent = vi.spyOn(repository, 'deleteAgent')
    vi.spyOn(repository, 'findWorkspace').mockRejectedValueOnce(new Error('read failed'))
    const remove = new RemoveWorkspaceAgentUseCase(repository, runtime)

    await expect(
      remove.execute({
        agentId: 'agent-1',
        projectId: 'project-1',
        workspaceName: 'main'
      })
    ).rejects.toThrow('read failed')

    expect(deleteAgent).not.toHaveBeenCalled()
    expect(runtime.released).toEqual(['agent-1'])
  })
})

class RecordingWorkspaceAgentRuntime implements WorkspaceAgentRuntimePort {
  readonly disposed: string[] = []
  readonly released: string[] = []

  async disposeAgent(command: {
    readonly agentId: string
    readonly projectId: string
    readonly workspaceName: string
  }) {
    this.disposed.push(command.agentId)
    return Promise.resolve({ release: () => this.released.push(command.agentId) })
  }

  async reconfigureAgent(): Promise<null> {
    return null
  }
}

class MemoryAgentRepository implements AgentSessionRepository {
  private readonly workspaces = new Map<string, AgentSession[]>()

  async find(): Promise<AgentSession | null> {
    return null
  }

  async findAgent(
    projectId: string,
    workspaceName: string,
    agentId: string
  ): Promise<AgentSession | null> {
    return (
      this.workspaces
        .get(workspaceKey(projectId, workspaceName))
        ?.find((agent) => agent.id === agentId) ?? null
    )
  }

  async findWorkspace(
    projectId: string,
    workspaceName: string
  ): Promise<readonly AgentSession[] | null> {
    return this.workspaces.get(workspaceKey(projectId, workspaceName)) ?? null
  }

  async save(agent: AgentSession): Promise<void> {
    const key = workspaceKey(agent.projectId, agent.workspaceName)
    const agents = this.workspaces.get(key) ?? []
    this.workspaces.set(key, [...agents.filter((candidate) => candidate.id !== agent.id), agent])
  }

  async delete(scope: AgentConversationScope): Promise<void> {
    void scope
  }

  async deleteAgent(projectId: string, workspaceName: string, agentId: string): Promise<void> {
    const key = workspaceKey(projectId, workspaceName)
    const agents = this.workspaces.get(key)
    if (agents) {
      this.workspaces.set(
        key,
        agents.filter((agent) => agent.id !== agentId)
      )
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    for (const [key, agents] of this.workspaces.entries()) {
      if (agents.some((agent) => agent.projectId === projectId)) {
        this.workspaces.delete(key)
      }
    }
  }
}

function workspaceKey(projectId: string, workspaceName: string): string {
  return JSON.stringify([projectId, workspaceName])
}
