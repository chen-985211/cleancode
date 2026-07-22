import type { WorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import { toWorkspaceAgentSnapshot } from '../dto/WorkspaceAgentSnapshot'
import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'
import {
  AgentSession,
  defaultAgentLayoutPosition,
  defaultAgentLayoutSize
} from '../../domain/aggregates/AgentSession'

export interface ListWorkspaceAgentsCommand {
  readonly projectId: string
  readonly workspaceName: string
}

export class ListWorkspaceAgentsUseCase {
  constructor(
    private readonly repository: AgentSessionRepository,
    private readonly providers: AgentProviderRegistryPort,
    private readonly defaultProviderId: string
  ) {}

  async execute(command: ListWorkspaceAgentsCommand): Promise<readonly WorkspaceAgentSnapshot[]> {
    const agents = await this.repository.findWorkspace(command.projectId, command.workspaceName)

    if (agents) {
      return agents.map(toWorkspaceAgentSnapshot)
    }

    const provider = this.providers.require(this.defaultProviderId)
    const defaultAgent = AgentSession.create({
      agentId: createAgentId(),
      cleancodeMcpEnabled: provider.descriptor.capabilities.cleancodeMcp !== 'unsupported',
      layout: {
        position: defaultAgentLayoutPosition,
        size: defaultAgentLayoutSize
      },
      name: 'Agent 1',
      projectId: command.projectId,
      providerId: provider.descriptor.id,
      workspaceName: command.workspaceName
    })
    await this.repository.save(defaultAgent)
    return [toWorkspaceAgentSnapshot(defaultAgent)]
  }
}

function createAgentId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-${Date.now()}-${Math.random()}`
}
