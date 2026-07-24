import type { WorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import { toWorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import type { AgentWorkspaceInitializer } from '../ports/AgentWorkspaceInitializer'
import { AgentWorkspaceTransactionCoordinator } from '../services/AgentWorkspaceTransactionCoordinator'

export interface ListWorkspaceAgentsCommand {
  readonly projectId: string
  readonly workspaceName: string
}

export class ListWorkspaceAgentsUseCase {
  constructor(
    private readonly repository: AgentSessionRepository & AgentWorkspaceInitializer,
    private readonly transactions = new AgentWorkspaceTransactionCoordinator()
  ) {}

  async execute(command: ListWorkspaceAgentsCommand): Promise<readonly WorkspaceAgentSnapshot[]> {
    return this.transactions.run(command.projectId, command.workspaceName, async () => {
      const agents = await this.repository.findWorkspace(command.projectId, command.workspaceName)

      if (agents) {
        return agents.map(toWorkspaceAgentSnapshot)
      }

      const initialized = await this.repository.initializeWorkspace({
        agents: [],
        projectId: command.projectId,
        workspaceName: command.workspaceName
      })
      return initialized.map(toWorkspaceAgentSnapshot)
    })
  }
}
