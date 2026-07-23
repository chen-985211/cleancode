export interface AgentWorkspaceCreationScope {
  readonly gitBranch: string | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly workspaceDirectory: string
  readonly workspaceName: string
}

export interface AgentWorkspaceCreationScopePort {
  run<T>(scope: AgentWorkspaceCreationScope, operation: () => Promise<T>): Promise<T>
}

export const allowAgentWorkspaceCreationScope: AgentWorkspaceCreationScopePort = {
  run: async (_scope, operation) => operation()
}
