export interface WorkspaceBaseBranches {
  readonly branches: readonly string[]
  readonly defaultBranch: string | null
}

export type WorkspaceBaseBranchRef =
  | {
      readonly kind: 'local'
      readonly name: string
      readonly checkedOut: boolean
      readonly upstream: string
    }
  | { readonly kind: 'remote'; readonly name: string; readonly target: string }

const originHead = 'refs/remotes/origin/HEAD'

// Refs arrive in Git name order (local refs first). Equal priorities keep
// the first ref, so even the full fallback needs only the two best candidates.
export class WorkspaceBaseBranchSelection {
  private readonly workspaceRef: string | null
  private local?: Extract<WorkspaceBaseBranchRef, { kind: 'local' }>
  private remote?: string
  private localRank = Infinity
  private remoteRank = Infinity

  constructor(currentBranch: string | null) {
    this.workspaceRef = currentBranch ? `refs/heads/${currentBranch}` : null
  }

  get preferredRefs(): readonly string[] {
    return this.workspaceRef ? [this.workspaceRef, originHead] : [originHead]
  }

  get fallbackPrefixes(): readonly string[] {
    const prefixes = []
    if (this.localRank !== 0) prefixes.push('refs/heads/')
    if (this.remoteRank !== 0) prefixes.push('refs/remotes/')
    return prefixes
  }

  consider(ref: WorkspaceBaseBranchRef, preferredOnly = false): void {
    if (ref.kind === 'local') {
      const rank = ref.name === this.workspaceRef ? 0 : ref.checkedOut ? 1 : 2
      if (rank < this.localRank) {
        this.local = ref
        this.localRank = rank
      }
      return
    }
    const rank = this.rankRemote(ref)
    if (rank < this.remoteRank && (!preferredOnly || rank === 0)) {
      this.remote = ref.target || ref.name
      this.remoteRank = rank
    }
  }

  private rankRemote(ref: Extract<WorkspaceBaseBranchRef, { kind: 'remote' }>): number {
    if (ref.target) {
      if (ref.name === originHead) return 0
      return ref.name.endsWith('/HEAD') ? 1 : Infinity
    }
    if (ref.name === 'refs/remotes/origin/main') return 2
    if (ref.name === 'refs/remotes/origin/master') return 3
    if (ref.name === this.local?.upstream) return 4
    return 5
  }

  result(): WorkspaceBaseBranches {
    const branches = [this.remote, this.local?.name].filter((ref) => ref !== undefined)
    return { branches, defaultBranch: branches[0] ?? null }
  }
}
