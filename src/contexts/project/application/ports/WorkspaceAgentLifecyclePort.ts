export interface WorkspaceAgentLifecyclePort {
  suspend(workspaceDirectory: string): Promise<boolean>
  resume(workspaceDirectory: string): Promise<void>
}
