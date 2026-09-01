import type { WorkbenchSnapshot } from '../../types/workbenchSnapshot'

type WorkspaceSnapshot = WorkbenchSnapshot['project']['workspaces'][number]

export function findCurrentWorkspace(
  workbench: WorkbenchSnapshot | null
): WorkspaceSnapshot | undefined {
  return workbench?.project.workspaces.find((workspace) => workspace.isCurrent)
}
