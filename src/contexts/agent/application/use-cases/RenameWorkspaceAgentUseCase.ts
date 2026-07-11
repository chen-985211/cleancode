import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { WorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import { toWorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'

export class RenameWorkspaceAgentUseCase {
  constructor(private readonly repository: AgentSessionRepository) {}

  async execute(command: {
    readonly agentId: string
    readonly name: string
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
    agent.rename(command.name)
    await this.repository.save(agent)
    return toWorkspaceAgentSnapshot(agent)
  }
}
