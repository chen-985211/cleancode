import { CreateWorkspaceAgentUseCase } from '../../../../src/contexts/agent/application/use-cases/CreateWorkspaceAgentUseCase'
import { AgentProviderAvailabilityService } from '../../../../src/contexts/agent/application/services/AgentProviderAvailabilityService'
import { AgentProviderRegistry } from '../../../../src/contexts/agent/application/services/AgentProviderRegistry'
import type {
  AgentProviderAvailability,
  AgentProviderContribution
} from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import type { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'

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
        layout: { position: { x: 540, y: 120 }, size: { width: 720, height: 460 } },
        projectId: 'project-1',
        providerId: 'codex',
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
})

function createContribution(
  id: string,
  inspect: () => Promise<AgentProviderAvailability>
): AgentProviderContribution & {
  readonly detector: { readonly inspect: ReturnType<typeof vi.fn> }
} {
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
    detector: { inspect: vi.fn(inspect) },
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
