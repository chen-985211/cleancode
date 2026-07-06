export interface GitBranchNavigationItemSnapshot {
  readonly name: string
  readonly isCurrent: boolean
  readonly isMainWorkspaceBranch: boolean
  readonly worktreeDirectory: string | null
  readonly isSelectableInMainWorkspace: boolean
}

export interface GitBranchNavigationSnapshot {
  readonly branches: readonly GitBranchNavigationItemSnapshot[]
}
