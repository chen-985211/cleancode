import type { AgentLayoutSnapshot, AgentSession } from '../../domain/aggregates/AgentSession'

export interface WorkspaceAgentSnapshot {
  readonly agentId: string
  readonly layout: AgentLayoutSnapshot
  readonly name: string
  readonly projectId: string
  readonly workspaceName: string
}

export function toWorkspaceAgentSnapshot(agent: AgentSession): WorkspaceAgentSnapshot {
  return {
    agentId: agent.id,
    layout: agent.layout,
    name: agent.name,
    projectId: agent.projectId,
    workspaceName: agent.workspaceName
  }
}
