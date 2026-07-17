export interface AgentRuntimeScopeValidationCommand {
  readonly agentId: string
  readonly gitBranch: string | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly workspaceDirectory: string
  readonly workspaceName: string
}

export interface AgentRuntimeScopeValidationPort {
  isValid(command: AgentRuntimeScopeValidationCommand): Promise<boolean>
}

export const allowAgentRuntimeScope: AgentRuntimeScopeValidationPort = {
  isValid: async () => true
}
