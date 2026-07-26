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
    readonly workspaceId: string
  }): Promise<readonly WorkspaceAgentSnapshot[]> {
    const runtimeLease = await this.runtime.disposeAgent(command)
    try {
      const workspaceAgents =
        (await this.repository.findWorkspace(command.projectId, command.workspaceId)) ?? []
      await this.repository.deleteAgent(command.projectId, command.workspaceId, command.agentId)
      return workspaceAgents
        .filter((agent) => agent.id !== command.agentId)
        .map(toWorkspaceAgentSnapshot)
    } finally {
      runtimeLease.release()
    }
  }
}
