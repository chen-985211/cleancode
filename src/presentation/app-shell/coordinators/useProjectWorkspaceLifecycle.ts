import { useCallback } from 'react'
import { useBranchWorkspaceActions } from './useBranchWorkspaceActions'
import { useWorkspaceInitialization } from './useWorkspaceInitialization'
import type { ProjectSnapshot } from '../../../contexts/project/application/dto/ProjectSnapshot'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'

type ProjectWorkspaceLifecycleInput = Omit<
  Parameters<typeof useBranchWorkspaceActions>[0],
  'rememberCreatedWorkspace' | 'rememberCheckout'
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
  const rememberCheckout = useCallback(
    (origin: WorkbenchSnapshot, checkout: WorkbenchSnapshot) => {
      const merge = (current: WorkbenchSnapshot) => mergeCheckout(current, origin, checkout)
      setWorkbenches((current) => current.map(merge))
      setCurrentWorkbench((current) => (current ? merge(current) : current))
    },
    [setWorkbenches, setCurrentWorkbench]
  )
  const branchWorkspaceActions = useBranchWorkspaceActions({
    ...input,
    rememberCreatedWorkspace,
    rememberCheckout
  })
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

function mergeCheckout(
  current: WorkbenchSnapshot,
  origin: WorkbenchSnapshot,
  checkout: WorkbenchSnapshot
): WorkbenchSnapshot {
  if (
    current.project.id !== checkout.project.id ||
    current.project.directory !== checkout.project.directory
  )
    return current
  const main = current.project.workspaces.find((workspace) => workspace.workspaceKind === 'default')
  const updated = checkout.project.workspaces.find(
    (workspace) => workspace.workspaceKind === 'default'
  )
  if (
    !main ||
    !updated ||
    main.workspaceId !== updated.workspaceId ||
    main.directory !== updated.directory
  )
    return current

  let gitBranches = checkout.gitBranches
  if (current.gitBranches !== origin.gitBranches) {
    // Preserve concurrent changes to unrelated branches in the sidebar.
    const rebound = (name: string) => name === main.gitBranch || name === updated.gitBranch
    const replacements = new Map(
      checkout.gitBranches
        .filter((branch) => rebound(branch.name))
        .map((branch) => [branch.name, branch])
    )
    const merged = current.gitBranches.flatMap((branch) => {
      if (!rebound(branch.name)) return [branch]
      const replacement = replacements.get(branch.name)
      replacements.delete(branch.name)
      return replacement ? [replacement] : []
    })
    gitBranches = [...merged, ...replacements.values()]
  }
  return {
    ...current,
    gitBranches,
    project: {
      ...current.project,
      workspaces: current.project.workspaces.map((item) =>
        item === main
          ? { ...item, gitBranch: updated.gitBranch, displayName: updated.displayName }
          : item
      )
    }
  }
}
