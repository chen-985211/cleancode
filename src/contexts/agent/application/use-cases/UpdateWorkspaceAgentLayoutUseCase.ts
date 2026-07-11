import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { WorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import { toWorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import type { AgentLayoutSnapshot } from '../../domain/aggregates/AgentSession'

export class UpdateWorkspaceAgentLayoutUseCase {
  constructor(private readonly repository: AgentSessionRepository) {}

  async execute(command: {
    readonly agentId: string
    readonly layout: AgentLayoutSnapshot
    readonly projectId: string
    readonly workspaceName: string
  }): Promise<WorkspaceAgentSnapshot> {
    const agent = await this.repository.findAgent(
      command.projectId,
      command.workspaceName,
      command.agentId
    )
    if (!agent) {
      throw createExpectedAppError('AGENT_SESSION_NOT_FOUND', 'Agent was not found.')
    }
    agent.updateLayout(command.layout)
    await this.repository.save(agent)
    return toWorkspaceAgentSnapshot(agent)
  }
}
