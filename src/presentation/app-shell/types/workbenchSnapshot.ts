import type { WorkspaceAgentSnapshot } from '../../../contexts/agent/application/dto/WorkspaceAgentSnapshot'
import type { BlockGraphSnapshot } from '../../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { CanvasArrangementSnapshot } from '../../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { GitBranchNavigationItemSnapshot } from '../../../contexts/project/application/dto/GitBranchNavigationSnapshot'
import type { ProjectSnapshot } from '../../../contexts/project/application/dto/ProjectSnapshot'
import type { WorkspaceInitializationSnapshot } from '../../../contexts/project/application/dto/WorkspaceInitializationDetails'

export interface WorkbenchSnapshot {
  readonly initialization?: WorkspaceInitializationSnapshot | null
  readonly agents?: readonly WorkspaceAgentSnapshot[]
  readonly canvasArrangement?: CanvasArrangementSnapshot
  readonly isCurrentProject?: boolean
  readonly project: ProjectSnapshot
  readonly gitBranches: readonly GitBranchNavigationItemSnapshot[]
  readonly graph: BlockGraphSnapshot
}
