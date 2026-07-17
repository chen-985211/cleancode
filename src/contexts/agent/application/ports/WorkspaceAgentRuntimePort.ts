import type { AgentSessionSnapshot } from '../dto/AgentSessionProtocol'

interface WorkspaceAgentRuntimeLease {
  release(): void
}

export interface WorkspaceAgentRuntimePort {
  disposeAgent(command: {
    readonly agentId: string
    readonly projectId: string
    readonly workspaceName: string
  }): Promise<WorkspaceAgentRuntimeLease>
  reconfigureAgent(command: {
    readonly agentId: string
    readonly cleancodeMcpEnabled: boolean
    readonly projectId: string
    readonly workspaceName: string
  }): Promise<AgentSessionSnapshot | null>
}
