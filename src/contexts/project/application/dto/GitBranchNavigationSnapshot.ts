export interface GitBranchNavigationItemSnapshot {
  readonly name: string
  readonly isCurrent: boolean
  readonly isMainWorkspaceBranch: boolean
  readonly worktreeDirectory: string | null
  readonly isSelectableInMainWorkspace: boolean
  readonly isLocked: boolean
  readonly lockReason: string | null
}

export interface GitWorktreeNavigationItemSnapshot {
  readonly directory: string
  readonly isLocked: boolean
  readonly lockReason: string | null
}

export interface GitBranchNavigationSnapshot {
  readonly worktrees?: readonly GitWorktreeNavigationItemSnapshot[]
  readonly branches: readonly GitBranchNavigationItemSnapshot[]
}
