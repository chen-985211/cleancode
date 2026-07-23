import type { WorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import { toWorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'
import {
  allowAgentWorkspaceCreationScope,
  type AgentWorkspaceCreationScopePort
} from '../ports/AgentWorkspaceCreationScopePort'
import { AgentProviderAvailabilityService } from '../services/AgentProviderAvailabilityService'
import { AgentWorkspaceTransactionCoordinator } from '../services/AgentWorkspaceTransactionCoordinator'
import { AgentSession } from '../../domain/aggregates/AgentSession'
import { resolveInitialAgentLayout } from '../../domain/services/AgentInitialLayoutPolicy'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export interface CreateWorkspaceAgentCommand {
  readonly agentId: string
  readonly gitBranch: string | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly providerId: string
  readonly workspaceDirectory: string
  readonly workspaceName: string
}

export class CreateWorkspaceAgentUseCase {
  constructor(
    private readonly repository: AgentSessionRepository,
    private readonly providers: AgentProviderRegistryPort,
    private readonly availability = new AgentProviderAvailabilityService(providers),
    private readonly transactions = new AgentWorkspaceTransactionCoordinator(),
    private readonly creationScope: AgentWorkspaceCreationScopePort = allowAgentWorkspaceCreationScope
  ) {}

  async execute(command: CreateWorkspaceAgentCommand): Promise<WorkspaceAgentSnapshot> {
    const provider = this.providers.require(command.providerId)
    const agentId = command.agentId
    return this.transactions.run(command.projectId, command.workspaceName, async () => {
      const existing = await this.repository.findAgent(
        command.projectId,
        command.workspaceName,
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
          (await this.repository.findWorkspace(command.projectId, command.workspaceName)) ?? []
        const agent = AgentSession.create({
          agentId,
          cleancodeMcpEnabled: provider.descriptor.capabilities.cleancodeMcp !== 'unsupported',
          layout: resolveInitialAgentLayout(agents.map((candidate) => candidate.layout)),
          name: nextAgentName(agents.map((candidate) => candidate.name)),
          projectId: command.projectId,
          providerId: command.providerId,
          workspaceName: command.workspaceName
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
