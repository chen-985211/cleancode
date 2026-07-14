import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { AgentSessionSnapshot } from '../dto/AgentSessionProtocol'
import type { WorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import { toWorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import type { WorkspaceAgentRuntimePort } from '../ports/WorkspaceAgentRuntimePort'

export interface UpdateWorkspaceAgentMcpCapabilityResult {
  readonly agent: WorkspaceAgentSnapshot
  readonly session: AgentSessionSnapshot | null
}

export class UpdateWorkspaceAgentMcpCapabilityUseCase {
  constructor(
    private readonly repository: AgentSessionRepository,
    private readonly runtime: WorkspaceAgentRuntimePort
  ) {}

  async execute(command: {
    readonly agentId: string
    readonly cleancodeMcpEnabled: boolean
    readonly projectId: string
    readonly workspaceName: string
  }): Promise<UpdateWorkspaceAgentMcpCapabilityResult> {
    const agent = await this.repository.findAgent(
      command.projectId,
      command.workspaceName,
      command.agentId
    )
    if (!agent) {
      throw createExpectedAppError('AGENT_SESSION_NOT_FOUND', 'Agent was not found.')
    }

    agent.setCleancodeMcpEnabled(command.cleancodeMcpEnabled)
    await this.repository.save(agent)
    const session = await this.runtime.reconfigureAgent(command)

    return { agent: toWorkspaceAgentSnapshot(agent), session }
  }
}
