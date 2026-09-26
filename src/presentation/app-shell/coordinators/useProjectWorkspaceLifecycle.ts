import { useBranchWorkspaceActions } from './useBranchWorkspaceActions'
import { useWorkspaceInitialization } from './useWorkspaceInitialization'
import type { ProjectSnapshot } from '../../../contexts/project/application/dto/ProjectSnapshot'
import type { WorkbenchSnapshot } from '../types/workbenchSnapshot'

type ProjectWorkspaceLifecycleInput = Parameters<typeof useBranchWorkspaceActions>[0] &
  Omit<Parameters<typeof useWorkspaceInitialization>[0], 'createWorkspace'>

export function useProjectWorkspaceLifecycle(input: ProjectWorkspaceLifecycleInput) {
  const branchWorkspaceActions = useBranchWorkspaceActions(input)
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
