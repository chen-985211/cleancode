import type { WorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import { toWorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import type { WorkspaceAgentRuntimePort } from '../ports/WorkspaceAgentRuntimePort'

export class RemoveWorkspaceAgentUseCase {
  constructor(
    private readonly repository: AgentSessionRepository,
    private readonly runtime: WorkspaceAgentRuntimePort
  ) {}

  async execute(command: {
    readonly agentId: string
    readonly projectId: string
    readonly workspaceName: string
  }): Promise<readonly WorkspaceAgentSnapshot[]> {
    await this.runtime.disposeAgent(command)
    await this.repository.deleteAgent(command.projectId, command.workspaceName, command.agentId)
    const remaining =
      (await this.repository.findWorkspace(command.projectId, command.workspaceName)) ?? []
    return remaining.map(toWorkspaceAgentSnapshot)
  }
}
