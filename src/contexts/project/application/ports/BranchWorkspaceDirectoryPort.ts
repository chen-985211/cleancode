export interface ResolveBranchWorkspaceDirectoryInput {
  readonly projectDirectory: string
  readonly branchName: string
}

export interface BranchWorkspaceDirectoryPort {
  resolveBranchWorkspaceDirectory(input: ResolveBranchWorkspaceDirectoryInput): string
}
