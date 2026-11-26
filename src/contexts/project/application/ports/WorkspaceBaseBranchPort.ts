import type { WorkspaceBaseBranches } from '../dto/WorkspaceBaseBranches'

export interface WorkspaceBaseBranchPort {
  list(directory: string, currentBranch: string | null): Promise<WorkspaceBaseBranches>
  resolve(directory: string, branch: string): Promise<string>
}
