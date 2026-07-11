import type { AgentSession } from '../../domain/aggregates/AgentSession'
import type { AgentConversationScope } from '../../domain/value-objects/AgentConversationScope'

export interface AgentSessionRepository {
  find(scope: AgentConversationScope): Promise<AgentSession | null>
  save(session: AgentSession): Promise<void>
  delete(scope: AgentConversationScope): Promise<void>
  deleteProject(projectId: string): Promise<void>
}
