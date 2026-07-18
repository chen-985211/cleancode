import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { GitRepositoryInspection } from '../ports/GitWorkspacePort'
import type { ProjectRepository } from '../ports/ProjectRepository'
import type { WorkspaceRunLifecyclePort } from '../ports/WorkspaceRunLifecyclePort'
import type { Project } from '../../domain/aggregates/Project'

interface SaveSynchronizedProjectInput {
  readonly currentSnapshot: ProjectSnapshot | null
  readonly project: Project
  readonly projectRepository: ProjectRepository
  readonly workspaceRunLifecyclePort: WorkspaceRunLifecyclePort
  readonly afterCommit: () => void
}

export function synchronizeProjectGitBinding(
  project: Project,
  inspection: GitRepositoryInspection
): Project {
  if (!inspection.isGitRepository) {
    return project.syncGitBranchWorkspaces({
      mainDirectory: project.directory,
      mainGitBranch: null,
      worktrees: []
    })
  }

  const mainGitBranch =
    inspection.branches.find((branch) => branch.isCurrent)?.name ?? inspection.currentBranch
  const worktrees = inspection.branches
    .filter((branch) => branch.worktreeDirectory && !branch.isCurrent)
    .map((branch) => ({
      branchName: branch.name,
      directory: branch.worktreeDirectory ?? project.directory
    }))

  return project.syncGitBranchWorkspaces({
    mainDirectory: project.directory,
    mainGitBranch,
    worktrees
  })
}

export async function saveSynchronizedProject(input: SaveSynchronizedProjectInput): Promise<void> {
  let runLease: Awaited<ReturnType<WorkspaceRunLifecyclePort['disposeWorkspaces']>> | null = null

  try {
    if (input.currentSnapshot) {
      const synchronizedSnapshot = input.project.toSnapshot()
      const affectedWorkspaceNames = findChangedRuntimeWorkspaceNames(
        input.currentSnapshot,
        synchronizedSnapshot
      )

      if (affectedWorkspaceNames.length > 0) {
        runLease = await input.workspaceRunLifecyclePort.disposeWorkspaces({
          projectDirectory: input.project.directory,
          workspaceNames: affectedWorkspaceNames
        })
      }
    }

    await input.projectRepository.save(input.project)
    runLease?.resolve()
    input.afterCommit()
  } catch (error) {
    runLease?.quarantine()
    throw error
  }
}

export function areProjectSnapshotsEqual(left: ProjectSnapshot, right: ProjectSnapshot): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.directory === right.directory &&
    left.workspaces.length === right.workspaces.length &&
    left.workspaces.every((workspace, index) => {
      const rightWorkspace = right.workspaces[index]

      return (
        rightWorkspace !== undefined &&
        workspace.name === rightWorkspace.name &&
        workspace.directory === rightWorkspace.directory &&
        workspace.gitBranch === rightWorkspace.gitBranch &&
        workspace.isCurrent === rightWorkspace.isCurrent
      )
    })
  )
}

function findChangedRuntimeWorkspaceNames(
  current: ProjectSnapshot,
  synchronized: ProjectSnapshot
): readonly string[] {
  return current.workspaces
    .filter((workspace) => {
      const nextWorkspace = synchronized.workspaces.find(
        (candidate) => candidate.name === workspace.name
      )

      return (
        !nextWorkspace ||
        nextWorkspace.directory !== workspace.directory ||
        nextWorkspace.gitBranch !== workspace.gitBranch
      )
    })
    .map((workspace) => workspace.name)
}
