import { CreateWorkspaceAgentUseCase } from '../../../../src/contexts/agent/application/use-cases/CreateWorkspaceAgentUseCase'
import { ListWorkspaceAgentsUseCase } from '../../../../src/contexts/agent/application/use-cases/ListWorkspaceAgentsUseCase'
import { RemoveWorkspaceAgentUseCase } from '../../../../src/contexts/agent/application/use-cases/RemoveWorkspaceAgentUseCase'
import { RenameWorkspaceAgentUseCase } from '../../../../src/contexts/agent/application/use-cases/RenameWorkspaceAgentUseCase'
import { UpdateWorkspaceAgentLayoutUseCase } from '../../../../src/contexts/agent/application/use-cases/UpdateWorkspaceAgentLayoutUseCase'
import { AgentProviderAvailabilityService } from '../../../../src/contexts/agent/application/services/AgentProviderAvailabilityService'
import { AgentProviderRegistry } from '../../../../src/contexts/agent/application/services/AgentProviderRegistry'
import { AgentWorkspaceTransactionCoordinator } from '../../../../src/contexts/agent/application/services/AgentWorkspaceTransactionCoordinator'
import type { AgentProviderContribution } from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import type {
  AgentWorkspaceInitializer,
  InitializeAgentWorkspaceCommand
} from '../../../../src/contexts/agent/application/ports/AgentWorkspaceInitializer'
import type { WorkspaceAgentRuntimePort } from '../../../../src/contexts/agent/application/ports/WorkspaceAgentRuntimePort'
import type { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import type { AgentConversationScope } from '../../../../src/contexts/agent/domain/value-objects/AgentConversationScope'
import { createExpectedAppError } from '../../../../src/shared-kernel/application/errors/AppError'

describe('manage workspace Agents', () => {
  it('does not persist an Agent for an unregistered Provider', async () => {
    const repository = new MemoryAgentRepository()
    const save = vi.spyOn(repository, 'save')
    const useCase = new CreateWorkspaceAgentUseCase(repository, createProviderRegistry())

    await expect(
      useCase.execute({
        agentId: 'agent-unknown',
        gitBranch: null,
        projectDirectory: '/work/app',
        projectId: 'project-1',
        providerId: 'unknown-provider',
        workspaceDirectory: '/work/app',
        workspaceName: 'main'
      })
    ).rejects.toThrowError(expect.objectContaining({ code: 'AGENT_PROVIDER_NOT_FOUND' }))

    expect(save).not.toHaveBeenCalled()
  })

  it('persists one Agent when the same creation intent is submitted concurrently', async () => {
    const repository = new MemoryAgentRepository()
    const save = vi.spyOn(repository, 'save')
    const useCase = new CreateWorkspaceAgentUseCase(repository, createProviderRegistry())
    const command = {
      agentId: 'agent-create-1',
      gitBranch: null,
      projectDirectory: '/work/app',
      projectId: 'project-1',
      providerId: 'codex',
      workspaceDirectory: '/work/app',
      workspaceName: 'main'
    }

    const [first, repeated] = await Promise.all([
      useCase.execute(command),
      useCase.execute(command)
    ])

    expect(repeated).toEqual(first)
    expect(save).toHaveBeenCalledOnce()
  })

  it('rejects changing the Provider of an already committed creation intent', async () => {
    const repository = new MemoryAgentRepository()
    const useCase = new CreateWorkspaceAgentUseCase(repository, createProviderRegistry())
    const command = {
      agentId: 'agent-create-1',
      gitBranch: null,
      projectDirectory: '/work/app',
      projectId: 'project-1',
      providerId: 'codex',
      workspaceDirectory: '/work/app',
      workspaceName: 'main'
    }

    await useCase.execute(command)

    await expect(useCase.execute({ ...command, providerId: 'claude-code' })).rejects.toMatchObject({
      code: 'AGENT_CREATION_CONFLICT'
    })
    await expect(repository.findAgent('project-1', 'main', command.agentId)).resolves.toMatchObject(
      {
        providerId: 'codex'
      }
    )
  })

  it('does not persist an Agent when the requested Project workspace scope is stale', async () => {
    const repository = new MemoryAgentRepository()
    const providers = createProviderRegistry()
    const save = vi.spyOn(repository, 'save')
    const useCase = new CreateWorkspaceAgentUseCase(
      repository,
      providers,
      new AgentProviderAvailabilityService(providers),
      new AgentWorkspaceTransactionCoordinator(),
      {
        run: async () => {
          throw createExpectedAppError(
            'AGENT_WORKSPACE_SCOPE_STALE',
            'Agent workspace scope is no longer active.'
          )
        }
      }
    )

    await expect(
      useCase.execute({
        agentId: 'agent-stale',
        gitBranch: null,
        projectDirectory: '/work/app',
        projectId: 'project-1',
        providerId: 'codex',
        workspaceDirectory: '/work/app',
        workspaceName: 'main'
      })
    ).rejects.toMatchObject({ code: 'AGENT_WORKSPACE_SCOPE_STALE' })
    expect(save).not.toHaveBeenCalled()
  })

  it('allocates unique names when different Agent creation intents run concurrently', async () => {
    const repository = new MemoryAgentRepository()
    const useCase = new CreateWorkspaceAgentUseCase(repository, createProviderRegistry())
    const create = (agentId: string) =>
      useCase.execute({
        agentId,
        gitBranch: null,
        projectDirectory: '/work/app',
        projectId: 'project-1',
        providerId: 'codex',
        workspaceDirectory: '/work/app',
        workspaceName: 'main'
      })

    const created = await Promise.all([create('agent-create-1'), create('agent-create-2')])

    expect(created.map((agent) => agent.name)).toEqual(['Agent 1', 'Agent 2'])
    expect(created.map((agent) => agent.layout)).toEqual([
      {
        position: { x: 540, y: 120 },
        size: { width: 720, height: 460 }
      },
      {
        position: { x: 1308, y: 120 },
        size: { width: 720, height: 460 }
      }
    ])
  })

  it('creates one default Agent only when a workspace is first initialized', async () => {
    const repository = new MemoryAgentRepository()
    const useCase = new ListWorkspaceAgentsUseCase(repository, createProviderRegistry(), 'codex')

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

  it('uses the configured registered Provider for a workspace default Agent', async () => {
    const repository = new MemoryAgentRepository()
    const useCase = new ListWorkspaceAgentsUseCase(
      repository,
      createProviderRegistry(),
      'claude-code'
    )

    await expect(
      useCase.execute({ projectId: 'project-1', workspaceName: 'main' })
    ).resolves.toEqual([expect.objectContaining({ providerId: 'claude-code' })])
  })

  it('initializes an empty workspace when the preferred Provider is unavailable', async () => {
    const repository = new MemoryAgentRepository()
    const providers = createProviderRegistry({
      codex: 'missing',
      'claude-code': 'installed'
    })
    const useCase = new ListWorkspaceAgentsUseCase(repository, providers, 'codex')

    const initialized = await useCase.execute({
      projectId: 'project-1',
      workspaceName: 'main'
    })
    const reopened = await useCase.execute({
      projectId: 'project-1',
      workspaceName: 'main'
    })

    expect(initialized).toEqual([])
    expect(reopened).toEqual([])
    expect(repository.initializeWorkspace).toHaveBeenCalledOnce()
  })

  it('refreshes a cached preferred Provider result before initializing a new workspace', async () => {
    const repository = new MemoryAgentRepository()
    const codex = createProviderContribution('codex')
    const inspect = vi
      .spyOn(codex.detector, 'inspect')
      .mockResolvedValueOnce({
        installCommand: 'install codex',
        providerId: 'codex',
        reason: 'not_found',
        status: 'missing',
        version: null
      })
      .mockResolvedValueOnce({
        providerId: 'codex',
        status: 'installed',
        version: 'test'
      })
    const providers = new AgentProviderRegistry([codex])
    const availability = new AgentProviderAvailabilityService(providers)
    await availability.inspect('codex')
    const useCase = new ListWorkspaceAgentsUseCase(repository, providers, 'codex', availability)

    await expect(
      useCase.execute({ projectId: 'project-1', workspaceName: 'main' })
    ).resolves.toEqual([expect.objectContaining({ providerId: 'codex' })])
    expect(inspect).toHaveBeenCalledTimes(2)
  })

  it('creates, renames, lays out, and removes one Agent without affecting its sibling', async () => {
    const repository = new MemoryAgentRepository()
    const runtime = new RecordingWorkspaceAgentRuntime()
    const list = new ListWorkspaceAgentsUseCase(repository, createProviderRegistry(), 'codex')
    const create = new CreateWorkspaceAgentUseCase(repository, createProviderRegistry())
    const rename = new RenameWorkspaceAgentUseCase(repository)
    const updateLayout = new UpdateWorkspaceAgentLayoutUseCase(repository)
    const remove = new RemoveWorkspaceAgentUseCase(repository, runtime)
    const [first] = await list.execute({ projectId: 'project-1', workspaceName: 'main' })
    const second = await create.execute({
      agentId: 'agent-2',
      gitBranch: null,
      projectDirectory: '/work/app',
      projectId: 'project-1',
      providerId: 'claude-code',
      workspaceDirectory: '/work/app',
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

class MemoryAgentRepository implements AgentSessionRepository, AgentWorkspaceInitializer {
  private readonly workspaces = new Map<string, AgentSession[]>()
  readonly initializeWorkspace = vi.fn(
    async (command: InitializeAgentWorkspaceCommand): Promise<readonly AgentSession[]> => {
      const key = workspaceKey(command.projectId, command.workspaceName)
      const existing = this.workspaces.get(key)
      if (existing) return existing
      const initialized = [...command.agents]
      this.workspaces.set(key, initialized)
      return initialized
    }
  )

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

function createProviderRegistry(
  availability: Readonly<Record<string, 'installed' | 'missing'>> = {}
): AgentProviderRegistry {
  return new AgentProviderRegistry([
    createProviderContribution('codex', availability.codex),
    createProviderContribution('claude-code', availability['claude-code'])
  ])
}

function createProviderContribution(
  id: string,
  availability: 'installed' | 'missing' = 'installed'
): AgentProviderContribution {
  return {
    descriptor: {
      capabilities: {
        activityTracking: false,
        cleancodeMcp: 'unsupported',
        launchInstructions: false,
        resume: false,
        sessionIdentityCapture: false,
        sessionRefCodec: false
      },
      displayName: id,
      icon: {
        paths: [{ d: 'M2 2h20v20H2z' }],
        viewBox: '0 0 24 24'
      },
      id
    },
    detector: {
      inspect: async () =>
        availability === 'installed'
          ? { providerId: id, status: 'installed', version: 'test' }
          : {
              installCommand: `install ${id}`,
              providerId: id,
              reason: 'not_found',
              status: 'missing',
              version: null
            }
    },
    launcher: {
      createLaunchPlan: async () => ({
        args: [],
        env: {},
        executable: id
      })
    }
  }
}
