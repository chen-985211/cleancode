export interface WorkspaceAgentRuntimePort {
  disposeAgent(command: {
    readonly agentId: string
    readonly projectId: string
    readonly workspaceName: string
  }): Promise<void>
}
