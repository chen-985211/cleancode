import type { WorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import { toWorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'
import type { AgentWorkspaceInitializer } from '../ports/AgentWorkspaceInitializer'
import {
  defaultAgentProviderPreferencesRepository,
  type AgentProviderPreferencesRepository
} from '../ports/AgentProviderPreferencesRepository'
import { AgentProviderAvailabilityService } from '../services/AgentProviderAvailabilityService'
import { AgentWorkspaceTransactionCoordinator } from '../services/AgentWorkspaceTransactionCoordinator'
import {
  AgentSession,
  defaultAgentLayoutPosition,
  defaultAgentLayoutSize
} from '../../domain/aggregates/AgentSession'

export interface ListWorkspaceAgentsCommand {
  readonly projectId: string
  readonly workspaceName: string
}

export class ListWorkspaceAgentsUseCase {
  constructor(
    private readonly repository: AgentSessionRepository & AgentWorkspaceInitializer,
    private readonly providers: AgentProviderRegistryPort,
    private readonly defaultProviderId: string,
    private readonly availability = new AgentProviderAvailabilityService(providers),
    private readonly transactions = new AgentWorkspaceTransactionCoordinator(),
    private readonly preferences: AgentProviderPreferencesRepository = defaultAgentProviderPreferencesRepository
  ) {}

  async execute(command: ListWorkspaceAgentsCommand): Promise<readonly WorkspaceAgentSnapshot[]> {
    return this.transactions.run(command.projectId, command.workspaceName, async () => {
      const agents = await this.repository.findWorkspace(command.projectId, command.workspaceName)

      if (agents) {
        return agents.map(toWorkspaceAgentSnapshot)
      }

      const preferences = await this.preferences.load()
      const defaultProviderEnabled = !preferences.disabledProviderIds.includes(
        this.defaultProviderId
      )
      const providerAvailability = defaultProviderEnabled
        ? await this.availability.inspect(this.defaultProviderId, { refresh: true })
        : null
      const initialAgents =
        providerAvailability?.status === 'installed'
          ? [this.createDefaultAgent(command, preferences.defaultCleancodeMcpEnabled)]
          : []
      const initialized = await this.repository.initializeWorkspace({
        agents: initialAgents,
        projectId: command.projectId,
        workspaceName: command.workspaceName
      })
      return initialized.map(toWorkspaceAgentSnapshot)
    })
  }

  private createDefaultAgent(
    command: ListWorkspaceAgentsCommand,
    defaultCleancodeMcpEnabled: boolean
  ): AgentSession {
    const provider = this.providers.require(this.defaultProviderId)
    return AgentSession.create({
      agentId: createAgentId(),
      cleancodeMcpEnabled:
        defaultCleancodeMcpEnabled &&
        provider.descriptor.capabilities.cleancodeMcp !== 'unsupported',
      layout: {
        position: defaultAgentLayoutPosition,
        size: defaultAgentLayoutSize
      },
      name: 'Agent 1',
      projectId: command.projectId,
      providerId: provider.descriptor.id,
      workspaceName: command.workspaceName
    })
  }
}

function createAgentId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-${Date.now()}-${Math.random()}`
}
