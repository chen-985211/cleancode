import type {
  GitBranchNavigationItemSnapshot,
  GitWorktreeNavigationItemSnapshot
} from '../../application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from '../../application/dto/ProjectSnapshot'

export interface ProjectWorkbenchViewModel {
  readonly gitWorktrees?: readonly GitWorktreeNavigationItemSnapshot[]
  readonly gitBranches: readonly GitBranchNavigationItemSnapshot[]
  readonly project: ProjectSnapshot
}
