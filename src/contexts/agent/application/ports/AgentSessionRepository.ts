import type { AgentSession } from '../../domain/aggregates/AgentSession'
import type { AgentConversationScope } from '../../domain/value-objects/AgentConversationScope'

export interface AgentSessionRepository {
  find(scope: AgentConversationScope): Promise<AgentSession | null>
  findAgent(projectId: string, workspaceName: string, agentId: string): Promise<AgentSession | null>
  findWorkspace(projectId: string, workspaceName: string): Promise<readonly AgentSession[] | null>
  save(session: AgentSession): Promise<void>
  delete(scope: AgentConversationScope): Promise<void>
  deleteAgent(projectId: string, workspaceName: string, agentId: string): Promise<void>
  deleteProject(projectId: string): Promise<void>
}
