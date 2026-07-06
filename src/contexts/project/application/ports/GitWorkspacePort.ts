export interface GitBranchInspection {
  readonly name: string
  readonly worktreeDirectory: string | null
  readonly isCurrent: boolean
}

export interface GitRepositoryInspection {
  readonly isGitRepository: boolean
  readonly currentBranch: string | null
  readonly localBranches: readonly string[]
  readonly branches: readonly GitBranchInspection[]
}

export interface CreateBranchWorktreeCommand {
  readonly repositoryDirectory: string
  readonly branchName: string
  readonly worktreeDirectory: string
}

export interface CheckoutBranchCommand {
  readonly repositoryDirectory: string
  readonly branchName: string
}

export interface GitWorkspacePort {
  inspectRepository(directory: string): Promise<GitRepositoryInspection>
  createBranchWorktree(command: CreateBranchWorktreeCommand): Promise<void>
  isWorkingTreeClean(directory: string): Promise<boolean>
  checkoutBranch(command: CheckoutBranchCommand): Promise<void>
}
