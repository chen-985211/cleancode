export interface AgentWorkspaceCreationScope {
  readonly projectDirectory: string
  readonly projectId: string
  readonly workspaceDirectory: string
  readonly workspaceId: string
}

export interface AgentWorkspaceCreationScopePort {
  run<T>(scope: AgentWorkspaceCreationScope, operation: () => Promise<T>): Promise<T>
}

export const allowAgentWorkspaceCreationScope: AgentWorkspaceCreationScopePort = {
  run: async (_scope, operation) => operation()
}
