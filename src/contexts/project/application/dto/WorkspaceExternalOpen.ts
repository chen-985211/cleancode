export type WorkspaceExternalOpenTarget = 'vscode' | 'folder'

export interface WorkspaceExternalOpenCapabilitiesSnapshot {
  readonly vscode: {
    readonly available: boolean
    readonly iconDataUrl: string | null
  }
}
