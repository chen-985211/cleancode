import type { WorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'

export interface AgentCreationRepository {
  findCreation(
    projectId: string,
    workspaceId: string,
    operationId: string
  ): Promise<WorkspaceAgentSnapshot | null>
}
