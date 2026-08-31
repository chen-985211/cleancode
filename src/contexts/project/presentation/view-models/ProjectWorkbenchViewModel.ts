import type { GitBranchNavigationItemSnapshot } from '../../application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from '../../application/dto/ProjectSnapshot'

export interface ProjectWorkbenchViewModel {
  readonly gitBranches: readonly GitBranchNavigationItemSnapshot[]
  readonly project: ProjectSnapshot
}
