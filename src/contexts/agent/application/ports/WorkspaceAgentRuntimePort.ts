import type { AgentSessionSnapshot } from '../dto/AgentSessionProtocol'

export interface WorkspaceAgentRuntimePort {
  disposeAgent(command: {
    readonly agentId: string
    readonly projectId: string
    readonly workspaceName: string
  }): Promise<void>
  reconfigureAgent(command: {
    readonly agentId: string
    readonly cleancodeMcpEnabled: boolean
    readonly projectId: string
    readonly workspaceName: string
  }): Promise<AgentSessionSnapshot | null>
}
