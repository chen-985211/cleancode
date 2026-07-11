import type { WorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import { toWorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import { AgentSession } from '../../domain/aggregates/AgentSession'

export interface ListWorkspaceAgentsCommand {
  readonly projectId: string
  readonly workspaceName: string
}

export class ListWorkspaceAgentsUseCase {
  constructor(private readonly repository: AgentSessionRepository) {}

  async execute(command: ListWorkspaceAgentsCommand): Promise<readonly WorkspaceAgentSnapshot[]> {
    const agents = await this.repository.findWorkspace(command.projectId, command.workspaceName)

    if (agents) {
      return agents.map(toWorkspaceAgentSnapshot)
    }

    const defaultAgent = AgentSession.create({
      agentId: createAgentId(),
      layout: { position: { x: 540, y: 120 }, size: { width: 440, height: 520 } },
      name: 'Agent 1',
      projectId: command.projectId,
      workspaceName: command.workspaceName
    })
    await this.repository.save(defaultAgent)
    return [toWorkspaceAgentSnapshot(defaultAgent)]
  }
}

function createAgentId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-${Date.now()}-${Math.random()}`
}
