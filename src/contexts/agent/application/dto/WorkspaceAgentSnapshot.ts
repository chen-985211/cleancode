import type { AgentLayoutSnapshot, AgentSession } from '../../domain/aggregates/AgentSession'

export { defaultAgentLayoutSize } from '../../domain/aggregates/AgentSession'

export interface WorkspaceAgentSnapshot {
  readonly agentId: string
  readonly cleancodeMcpEnabled: boolean
  readonly layout: AgentLayoutSnapshot
  readonly name: string
  readonly projectId: string
  readonly providerId: string
  readonly workspaceId: string
}

export function toWorkspaceAgentSnapshot(agent: AgentSession): WorkspaceAgentSnapshot {
  return {
    agentId: agent.id,
    cleancodeMcpEnabled: agent.cleancodeMcpEnabled,
    layout: agent.layout,
    name: agent.name,
    projectId: agent.projectId,
    providerId: agent.providerId,
    workspaceId: agent.workspaceId
  }
}
