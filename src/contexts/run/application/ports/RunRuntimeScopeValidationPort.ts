export interface ValidateRunRuntimeScopeCommand {
  readonly projectId: string
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
}

export interface RunRuntimeScopeValidationPort {
  validate(command: ValidateRunRuntimeScopeCommand): Promise<void>
}

export const noopRunRuntimeScopeValidationPort: RunRuntimeScopeValidationPort = {
  validate: async () => undefined
}
