import type { AgentSession } from '../../domain/aggregates/AgentSession'
import type { AgentConversationScope } from '../../domain/value-objects/AgentConversationScope'

export interface AgentSessionRepository {
  find(scope: AgentConversationScope): Promise<AgentSession | null>
  findAgent(projectId: string, workspaceId: string, agentId: string): Promise<AgentSession | null>
  findWorkspace(projectId: string, workspaceId: string): Promise<readonly AgentSession[] | null>
  save(session: AgentSession): Promise<void>
  delete(scope: AgentConversationScope): Promise<void>
  deleteAgent(projectId: string, workspaceId: string, agentId: string): Promise<void>
  deleteProject(projectId: string): Promise<void>
}
