import type { WorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import { toWorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'
import {
  defaultAgentProviderPreferencesRepository,
  type AgentProviderPreferencesRepository
} from '../ports/AgentProviderPreferencesRepository'
import {
  allowAgentWorkspaceCreationScope,
  type AgentWorkspaceCreationScopePort
} from '../ports/AgentWorkspaceCreationScopePort'
import { AgentProviderAvailabilityService } from '../services/AgentProviderAvailabilityService'
import { AgentWorkspaceTransactionCoordinator } from '../services/AgentWorkspaceTransactionCoordinator'
import { AgentSession, defaultAgentLayoutSize } from '../../domain/aggregates/AgentSession'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export interface CreateWorkspaceAgentCommand {
  readonly agentId: string
  readonly initialPosition: { readonly x: number; readonly y: number }
  readonly projectDirectory: string
  readonly projectId: string
  readonly providerId: string
  readonly workspaceDirectory: string
  readonly workspaceId: string
}

export class CreateWorkspaceAgentUseCase {
  constructor(
    private readonly repository: AgentSessionRepository,
    private readonly providers: AgentProviderRegistryPort,
    private readonly availability = new AgentProviderAvailabilityService(providers),
    private readonly transactions = new AgentWorkspaceTransactionCoordinator(),
    private readonly creationScope: AgentWorkspaceCreationScopePort = allowAgentWorkspaceCreationScope,
    private readonly preferences: AgentProviderPreferencesRepository = defaultAgentProviderPreferencesRepository
  ) {}

  async execute(command: CreateWorkspaceAgentCommand): Promise<WorkspaceAgentSnapshot> {
    const provider = this.providers.require(command.providerId)
    const agentId = command.agentId
    return this.transactions.run(command.projectId, command.workspaceId, async () => {
      const existing = await this.repository.findAgent(
        command.projectId,
        command.workspaceId,
        agentId
      )
      if (existing) {
        if (existing.providerId !== command.providerId) {
          throw createExpectedAppError(
            'AGENT_CREATION_CONFLICT',
            'Agent creation intent is already committed to another Provider.',
            {
              agentId,
              committedProviderId: existing.providerId,
              requestedProviderId: command.providerId
            }
          )
        }
        return toWorkspaceAgentSnapshot(existing)
      }

      const preferences = await this.preferences.load()
      if (preferences.disabledProviderIds.includes(command.providerId)) {
        throw createExpectedAppError(
          'AGENT_PROVIDER_DISABLED',
          `Agent Provider "${command.providerId}" is disabled.`,
          { providerId: command.providerId }
        )
      }
      const availability = await this.availability.inspect(command.providerId, { refresh: true })
      if (availability.status !== 'installed') {
        throw createExpectedAppError(
          'AGENT_PROVIDER_UNAVAILABLE',
          `Agent Provider "${command.providerId}" is unavailable.`,
          {
            providerId: command.providerId,
            status: availability.status
          }
        )
      }
      return this.creationScope.run(command, async () => {
        const agents =
          (await this.repository.findWorkspace(command.projectId, command.workspaceId)) ?? []
        const agent = AgentSession.create({
          agentId,
          cleancodeMcpEnabled:
            preferences.defaultCleancodeMcpEnabled && provider.descriptor.capabilities.cleancodeMcp,
          layout: {
            position: { ...command.initialPosition },
            size: { ...defaultAgentLayoutSize }
          },
          name: nextAgentName(agents.map((candidate) => candidate.name)),
          projectId: command.projectId,
          providerId: command.providerId,
          workspaceId: command.workspaceId
        })
        await this.repository.save(agent)
        return toWorkspaceAgentSnapshot(agent)
      })
    })
  }
}

function nextAgentName(names: readonly string[]): string {
  const existingNames = new Set(names)
  let index = 1
  while (existingNames.has(`Agent ${index}`)) index += 1
  return `Agent ${index}`
}
