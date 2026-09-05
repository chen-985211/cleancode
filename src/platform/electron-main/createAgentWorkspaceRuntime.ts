import { CreateWorkspaceAgentUseCase } from '../../contexts/agent/application/use-cases/CreateWorkspaceAgentUseCase'
import { ListWorkspaceAgentsUseCase } from '../../contexts/agent/application/use-cases/ListWorkspaceAgentsUseCase'
import { RenameWorkspaceAgentUseCase } from '../../contexts/agent/application/use-cases/RenameWorkspaceAgentUseCase'
import { UpdateWorkspaceAgentLayoutUseCase } from '../../contexts/agent/application/use-cases/UpdateWorkspaceAgentLayoutUseCase'
import { AgentWorkspaceTransactionCoordinator } from '../../contexts/agent/application/services/AgentWorkspaceTransactionCoordinator'
import { AgentPeerCreationRegistry } from '../../contexts/agent/application/services/AgentPeerCreationRegistry'
import { AgentCollaborationTools } from '../../contexts/agent/application/services/AgentCollaborationTools'
import { AgentMessageMailbox } from '../../contexts/agent/application/services/AgentMessageMailbox'
import type { AgentSessionRepository } from '../../contexts/agent/application/ports/AgentSessionRepository'
import type { AgentWorkspaceInitializer } from '../../contexts/agent/application/ports/AgentWorkspaceInitializer'
import type { AgentProviderRegistryPort } from '../../contexts/agent/application/ports/AgentProviderRegistryPort'
import type { AgentProviderAvailabilityService } from '../../contexts/agent/application/services/AgentProviderAvailabilityService'
import type { AgentWorkspaceCreationScopePort } from '../../contexts/agent/application/ports/AgentWorkspaceCreationScopePort'
import type { AgentProviderPreferencesRepository } from '../../contexts/agent/application/ports/AgentProviderPreferencesRepository'

export function createAgentWorkspaceRuntime(
  repository: AgentSessionRepository & AgentWorkspaceInitializer,
  providers: AgentProviderRegistryPort,
  availability: AgentProviderAvailabilityService,
  creationScope: AgentWorkspaceCreationScopePort,
  preferences: AgentProviderPreferencesRepository
) {
  const transactions = new AgentWorkspaceTransactionCoordinator()
  const peerCreationRegistry = new AgentPeerCreationRegistry(repository)
  const messageMailbox = new AgentMessageMailbox()
  return {
    messageMailbox,
    peerCreationRegistry,
    collaborationTools: new AgentCollaborationTools(
      repository,
      providers,
      availability,
      preferences,
      messageMailbox
    ),
    createWorkspaceAgentUseCase: new CreateWorkspaceAgentUseCase(
      repository,
      providers,
      availability,
      transactions,
      creationScope,
      preferences
    ),
    listWorkspaceAgentsUseCase: new ListWorkspaceAgentsUseCase(repository, transactions),
    renameWorkspaceAgentUseCase: new RenameWorkspaceAgentUseCase(repository),
    updateWorkspaceAgentLayoutUseCase: new UpdateWorkspaceAgentLayoutUseCase(repository)
  }
}
