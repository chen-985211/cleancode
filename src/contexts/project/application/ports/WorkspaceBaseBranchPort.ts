import type { WorkspaceBaseBranchRef } from '../../domain/services/WorkspaceBaseBranchSelection'

export interface WorkspaceBaseRefReader {
  /** Visit the requested full refs or slash-terminated namespaces in Git name order. */
  visit(refs: readonly string[], accept: (ref: WorkspaceBaseBranchRef) => void): Promise<void>
}

export interface WorkspaceBaseBranchPort {
  open(directory: string): Promise<WorkspaceBaseRefReader | null>
  resolve(directory: string, branch: string): Promise<string>
}
