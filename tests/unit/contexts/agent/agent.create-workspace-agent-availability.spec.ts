import { CreateWorkspaceAgentUseCase } from '../../../../src/contexts/agent/application/use-cases/CreateWorkspaceAgentUseCase'
import { AgentProviderAvailabilityService } from '../../../../src/contexts/agent/application/services/AgentProviderAvailabilityService'
import { AgentProviderRegistry } from '../../../../src/contexts/agent/application/services/AgentProviderRegistry'
import type {
  AgentProviderAvailability,
  AgentProviderContribution
} from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import type { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import { AgentProviderPreferences } from '../../../../src/contexts/agent/domain/aggregates/AgentProviderPreferences'

describe('create workspace Agent availability', () => {
  it('freshly validates the selected Provider before persisting the Agent', async () => {
    const contribution = createContribution('codex', async () => ({
      installCommand: 'install codex',
      providerId: 'codex',
      reason: 'not_found',
      status: 'missing',
      version: null
    }))
    const providers = new AgentProviderRegistry([contribution])
    const availability = new AgentProviderAvailabilityService(providers)
    await availability.inspect('codex')
    const repository = new RecordingAgentRepository()
    const useCase = new CreateWorkspaceAgentUseCase(repository, providers, availability)

    await expect(
      useCase.execute({
        agentId: 'agent-1',
        gitBranch: null,
        initialPosition: { x: 240, y: 320 },
        projectDirectory: '/work/app',
        projectId: 'project-1',
        providerId: 'codex',
        workspaceDirectory: '/work/app',
        workspaceName: 'main'
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'AGENT_PROVIDER_UNAVAILABLE',
        details: { providerId: 'codex', status: 'missing' }
      })
    )

    expect(contribution.detector.inspect).toHaveBeenCalledTimes(2)
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('uses the global MCP creation default without enabling unsupported Providers', async () => {
    const contribution = createContribution(
      'codex',
      async () => ({
        providerId: 'codex',
        status: 'installed',
        version: 'test'
      }),
      'best_effort'
    )
    const providers = new AgentProviderRegistry([contribution])
    const repository = new RecordingAgentRepository()
    const preferences = AgentProviderPreferences.create()
    preferences.setDefaultCleancodeMcpEnabled(false)
    const useCase = new CreateWorkspaceAgentUseCase(
      repository,
      providers,
      new AgentProviderAvailabilityService(providers),
      undefined,
      undefined,
      {
        load: async () => preferences.toSnapshot(),
        save: async () => undefined
      }
    )

    const snapshot = await useCase.execute({
      agentId: 'agent-1',
      gitBranch: null,
      initialPosition: { x: 240, y: 320 },
      projectDirectory: '/work/app',
      projectId: 'project-1',
      providerId: 'codex',
      workspaceDirectory: '/work/app',
      workspaceName: 'main'
    })

    expect(snapshot.cleancodeMcpEnabled).toBe(false)
  })

  it('rejects a Provider disabled in preferences', async () => {
    const contribution = createContribution('codex', async () => ({
      providerId: 'codex',
      status: 'installed',
      version: 'test'
    }))
    const providers = new AgentProviderRegistry([contribution])
    const repository = new RecordingAgentRepository()
    const preferences = AgentProviderPreferences.create()
    preferences.setProviderEnabled('codex', false)
    const useCase = new CreateWorkspaceAgentUseCase(
      repository,
      providers,
      new AgentProviderAvailabilityService(providers),
      undefined,
      undefined,
      {
        load: async () => preferences.toSnapshot(),
        save: async () => undefined
      }
    )

    await expect(
      useCase.execute({
        agentId: 'agent-1',
        gitBranch: null,
        initialPosition: { x: 240, y: 320 },
        projectDirectory: '/work/app',
        projectId: 'project-1',
        providerId: 'codex',
        workspaceDirectory: '/work/app',
        workspaceName: 'main'
      })
    ).rejects.toThrowError(
      expect.objectContaining({
        code: 'AGENT_PROVIDER_DISABLED',
        details: { providerId: 'codex' }
      })
    )
    expect(repository.save).not.toHaveBeenCalled()
  })
})

function createContribution(
  id: string,
  inspect: () => Promise<AgentProviderAvailability>,
  cleancodeMcp: AgentProviderContribution['descriptor']['capabilities']['cleancodeMcp'] = 'unsupported'
): AgentProviderContribution & {
  readonly detector: { readonly inspect: ReturnType<typeof vi.fn> }
} {
  return {
    descriptor: {
      capabilities: {
        activityTracking: false,
        cleancodeMcp,
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
    detector: { inspect: vi.fn(inspect) },
    ...(cleancodeMcp === 'unsupported'
      ? {}
      : {
          cleancodeCapability: {
            inject: async () => ({ args: [], env: {} })
          }
        }),
    launcher: {
      createLaunchPlan: async () => ({ args: [], env: {}, executable: id })
    }
  }
}

class RecordingAgentRepository implements AgentSessionRepository {
  readonly save = vi.fn(async () => undefined)

  async find(): Promise<AgentSession | null> {
    return null
  }

  async findAgent(): Promise<AgentSession | null> {
    return null
  }

  async findWorkspace(): Promise<readonly AgentSession[] | null> {
    return null
  }

  async delete(): Promise<void> {}

  async deleteAgent(): Promise<void> {}

  async deleteProject(): Promise<void> {}
}
