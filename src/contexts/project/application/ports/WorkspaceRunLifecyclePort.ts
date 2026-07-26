interface WorkspaceRunStartGateLease {
  readonly wasQuarantined: boolean
  quarantine(): void
  release(): void
  resolve(): void
}

export interface WorkspaceRunLifecyclePort {
  disposeProject(projectDirectory: string): Promise<WorkspaceRunStartGateLease>
  disposeWorkspace(command: {
    readonly projectDirectory: string
    readonly workspaceId: string
  }): Promise<WorkspaceRunStartGateLease>
  disposeWorkspaces(command: {
    readonly projectDirectory: string
    readonly workspaceIds: readonly string[]
  }): Promise<WorkspaceRunStartGateLease>
  isWorkspaceQuarantined(command: {
    readonly projectDirectory: string
    readonly workspaceId: string
  }): boolean
  resolveProjectQuarantines(projectDirectory: string): void
}

const noopLease: WorkspaceRunStartGateLease = {
  wasQuarantined: false,
  quarantine: () => undefined,
  release: () => undefined,
  resolve: () => undefined
}

export const noopWorkspaceRunLifecyclePort: WorkspaceRunLifecyclePort = {
  disposeProject: async () => noopLease,
  disposeWorkspace: async () => noopLease,
  disposeWorkspaces: async () => noopLease,
  isWorkspaceQuarantined: () => false,
  resolveProjectQuarantines: () => undefined
}
