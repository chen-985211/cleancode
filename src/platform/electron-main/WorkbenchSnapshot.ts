import type { WorkspaceAgentSnapshot } from '../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { BlockGraphSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { GitBranchNavigationItemSnapshot } from '../../contexts/project/application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from '../../contexts/project/application/dto/ProjectSnapshot'

export interface WorkbenchSnapshot {
  readonly agents: readonly WorkspaceAgentSnapshot[]
  readonly gitBranches: readonly GitBranchNavigationItemSnapshot[]
  readonly graph: BlockGraphSnapshot
  readonly project: ProjectSnapshot
}
