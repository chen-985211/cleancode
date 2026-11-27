import { WorkspaceBaseBranchSelection } from '../../domain/services/WorkspaceBaseBranchSelection'
import type { WorkspaceBaseBranchPort } from '../ports/WorkspaceBaseBranchPort'

export async function listWorkspaceBaseBranches(
  port: WorkspaceBaseBranchPort,
  directory: string,
  currentBranch: string | null
) {
  const selection = new WorkspaceBaseBranchSelection(currentBranch)
  const reader = await port.open(directory)
  if (reader) {
    await reader.visit(selection.preferredRefs, (ref) => selection.consider(ref, true))
    const remaining = selection.fallbackPrefixes
    if (remaining.length) await reader.visit(remaining, (ref) => selection.consider(ref))
  }
  return selection.result()
}
