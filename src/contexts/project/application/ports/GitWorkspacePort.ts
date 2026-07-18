export interface GitBranchInspection {
  readonly name: string
  readonly worktreeDirectory: string | null
  readonly isCurrent: boolean
  readonly isLocked: boolean
  readonly lockReason: string | null
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

export interface RemoveBranchWorktreeCommand {
  readonly repositoryDirectory: string
  readonly worktreeDirectory: string
}

export interface UnlockBranchWorktreeCommand {
  readonly repositoryDirectory: string
  readonly worktreeDirectory: string
}

export interface LockBranchWorktreeCommand {
  readonly repositoryDirectory: string
  readonly worktreeDirectory: string
  readonly reason: string | null
}

export interface PruneWorktreesCommand {
  readonly repositoryDirectory: string
}

export interface GitWorkspacePort {
  inspectRepository(directory: string): Promise<GitRepositoryInspection>
  createBranchWorktree(command: CreateBranchWorktreeCommand): Promise<void>
  isWorkingTreeClean(directory: string): Promise<boolean>
  checkoutBranch(command: CheckoutBranchCommand): Promise<void>
  lockBranchWorktree(command: LockBranchWorktreeCommand): Promise<void>
  removeBranchWorktree(command: RemoveBranchWorktreeCommand): Promise<void>
  unlockBranchWorktree(command: UnlockBranchWorktreeCommand): Promise<void>
  pruneWorktrees(command: PruneWorktreesCommand): Promise<void>
}
