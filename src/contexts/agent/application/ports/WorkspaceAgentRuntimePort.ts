import type { AgentSessionSnapshot } from '../dto/AgentSessionProtocol'

interface WorkspaceAgentRuntimeLease {
  release(): void
}

export interface WorkspaceAgentRuntimePort {
  disposeAgent(command: {
    readonly agentId: string
    readonly projectId: string
    readonly workspaceId: string
  }): Promise<WorkspaceAgentRuntimeLease>
  reconfigureAgent(command: {
    readonly agentId: string
    readonly cleancodeMcpEnabled: boolean
    readonly projectId: string
    readonly workspaceId: string
  }): Promise<AgentSessionSnapshot | null>
}
