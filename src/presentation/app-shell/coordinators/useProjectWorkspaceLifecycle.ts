import { useCallback } from 'react'
import { useBranchWorkspaceActions } from './useBranchWorkspaceActions'
import { useWorkspaceInitialization } from './useWorkspaceInitialization'
import type { ProjectSnapshot } from '../../../contexts/project/application/dto/ProjectSnapshot'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'

type ProjectWorkspaceLifecycleInput = Omit<
  Parameters<typeof useBranchWorkspaceActions>[0],
  'rememberCreatedWorkspace'
> &
  Omit<Parameters<typeof useWorkspaceInitialization>[0], 'createWorkspace'>

export function useProjectWorkspaceLifecycle(input: ProjectWorkspaceLifecycleInput) {
  const { setWorkbenches, setCurrentWorkbench } = input
  const rememberCreatedWorkspace = useCallback(
    (created: WorkbenchSnapshot) => {
      const merge = (current: WorkbenchSnapshot) => mergeCreatedWorkspace(current, created)
      setWorkbenches((current) => current.map(merge))
      setCurrentWorkbench((current) => (current ? merge(current) : current))
    },
    [setWorkbenches, setCurrentWorkbench]
  )
  const branchWorkspaceActions = useBranchWorkspaceActions({ ...input, rememberCreatedWorkspace })
  const workspaceInitialization = useWorkspaceInitialization({
    ...input,
    createWorkspace: branchWorkspaceActions.createBranchWorkspace
  })
  function updateIssueRepository(project: ProjectSnapshot) {
    const merge = (workbench: WorkbenchSnapshot): WorkbenchSnapshot =>
      workbench.project.id === project.id
        ? {
            ...workbench,
            project: { ...workbench.project, issueRepository: project.issueRepository }
          }
        : workbench
    input.setWorkbenches((current) => current.map(merge))
    input.setCurrentWorkbench((current) => (current ? merge(current) : current))
  }
  return { branchWorkspaceActions, workspaceInitialization, updateIssueRepository }
}

function mergeCreatedWorkspace(
  current: WorkbenchSnapshot,
  created: WorkbenchSnapshot
): WorkbenchSnapshot {
  if (
    current.project.id !== created.project.id ||
    current.project.directory !== created.project.directory
  )
    return current
  const workspace = created.project.workspaces.find(
    (item) => item.workspaceId === created.graph.workspaceId
  )
  if (!workspace) return current
  const exists = current.project.workspaces.some(
    (item) => item.workspaceId === workspace.workspaceId
  )
  const branch = created.gitBranches.find((item) => item.name === workspace.gitBranch)
  const branchExists = current.gitBranches.some((item) => item.name === workspace.gitBranch)
  // Publish only the creation result. The user's current canvas, selection, and
  // project settings may have changed while the request was in flight.
  return {
    ...current,
    project: {
      ...current.project,
      workspaces: exists
        ? current.project.workspaces.map((item) =>
            item.workspaceId === workspace.workspaceId
              ? { ...item, issue: item.issue ?? workspace.issue }
              : item
          )
        : [...current.project.workspaces, { ...workspace, isCurrent: false }]
    },
    gitBranches: !branch
      ? current.gitBranches
      : branchExists
        ? current.gitBranches.map((item) =>
            item.name === branch.name ? { ...branch, isCurrent: item.isCurrent } : item
          )
        : [...current.gitBranches, { ...branch, isCurrent: false }]
  }
}
