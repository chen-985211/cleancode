export interface WorkspaceAgentAttachmentLease {
  readonly wasQuarantined: boolean
  quarantine(): void
  release(): void
  resolve(): void
}

interface WorkspaceAgentSuspensionLease extends WorkspaceAgentAttachmentLease {
  readonly wasSuspended: boolean
  resume(): Promise<void>
}

export interface WorkspaceAgentLifecyclePort {
  disposeProject(projectDirectory: string): Promise<WorkspaceAgentAttachmentLease>
  disposeWorkspace(command: {
    readonly projectDirectory: string
    readonly workspaceId: string
  }): Promise<WorkspaceAgentAttachmentLease>
  isWorkspaceQuarantined(command: {
    readonly projectDirectory: string
    readonly workspaceId: string
  }): boolean
  resolveProjectQuarantines(projectDirectory: string): void
  suspend(workspaceDirectory: string): Promise<WorkspaceAgentSuspensionLease>
}

const noopAttachmentLease: WorkspaceAgentAttachmentLease = {
  wasQuarantined: false,
  quarantine: () => undefined,
  release: () => undefined,
  resolve: () => undefined
}

export const noopWorkspaceAgentLifecyclePort: WorkspaceAgentLifecyclePort = {
  disposeProject: async () => noopAttachmentLease,
  disposeWorkspace: async () => noopAttachmentLease,
  isWorkspaceQuarantined: () => false,
  resolveProjectQuarantines: () => undefined,
  suspend: async () => ({
    ...noopAttachmentLease,
    resume: async () => undefined,
    wasSuspended: false
  })
}
