import type { WorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import { toWorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import { AgentSession, type AgentLayoutSnapshot } from '../../domain/aggregates/AgentSession'

export interface CreateWorkspaceAgentCommand {
  readonly agentId?: string
  readonly layout: AgentLayoutSnapshot
  readonly projectId: string
  readonly providerId: string
  readonly workspaceName: string
}

export class CreateWorkspaceAgentUseCase {
  constructor(private readonly repository: AgentSessionRepository) {}

  async execute(command: CreateWorkspaceAgentCommand): Promise<WorkspaceAgentSnapshot> {
    const agents =
      (await this.repository.findWorkspace(command.projectId, command.workspaceName)) ?? []
    const agent = AgentSession.create({
      agentId: command.agentId ?? createAgentId(),
      layout: command.layout,
      name: nextAgentName(agents.map((candidate) => candidate.name)),
      projectId: command.projectId,
      providerId: command.providerId,
      workspaceName: command.workspaceName
    })
    await this.repository.save(agent)
    return toWorkspaceAgentSnapshot(agent)
  }
}

function nextAgentName(names: readonly string[]): string {
  const existingNames = new Set(names)
  let index = 1
  while (existingNames.has(`Agent ${index}`)) index += 1
  return `Agent ${index}`
}

function createAgentId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-${Date.now()}-${Math.random()}`
}
