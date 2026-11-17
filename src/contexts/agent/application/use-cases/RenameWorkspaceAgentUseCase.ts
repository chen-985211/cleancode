import { createAgentError } from '../errors/AgentErrors'

import type { WorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import { toWorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'

export class RenameWorkspaceAgentUseCase {
  constructor(private readonly repository: AgentSessionRepository) {}

  async execute(command: {
    readonly agentId: string
    readonly name: string
    readonly projectId: string
    readonly workspaceId: string
  }): Promise<WorkspaceAgentSnapshot> {
    const agent = await this.repository.findAgent(
      command.projectId,
      command.workspaceId,
      command.agentId
    )
    if (!agent) {
      throw createAgentError('AGENT_SESSION_NOT_FOUND', 'Agent was not found.')
    }
    agent.rename(command.name)
    await this.repository.save(agent)
    return toWorkspaceAgentSnapshot(agent)
  }
}
