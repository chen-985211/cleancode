export interface AgentRuntimeScopeValidationCommand {
  readonly agentId: string
  readonly projectDirectory: string
  readonly projectId: string
  readonly workspaceDirectory: string
  readonly workspaceId: string
}

export interface AgentRuntimeScopeValidationPort {
  isValid(command: AgentRuntimeScopeValidationCommand): Promise<boolean>
}

export const allowAgentRuntimeScope: AgentRuntimeScopeValidationPort = {
  isValid: async () => true
}
