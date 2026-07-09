import { Project } from '../../domain/aggregates/Project'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { GitWorkspacePort } from '../ports/GitWorkspacePort'
import type { ProjectRepository } from '../ports/ProjectRepository'

export interface SynchronizeProjectGitStateCommand {
  readonly projectDirectory: string
}

export class SynchronizeProjectGitStateUseCase {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly gitWorkspacePort: GitWorkspacePort
  ) {}

  async execute(command: SynchronizeProjectGitStateCommand): Promise<ProjectSnapshot | null> {
    const projectSnapshot = await this.projectRepository.findByDirectory(command.projectDirectory)

    if (!projectSnapshot) {
      throw createExpectedAppError('PROJECT_NOT_FOUND', 'Project was not found.')
    }

    const project = Project.fromSnapshot(projectSnapshot)
    const synchronizedProject = await this.synchronizeGitBinding(project)
    const synchronizedSnapshot = synchronizedProject.toSnapshot()

    if (areProjectSnapshotsEqual(projectSnapshot, synchronizedSnapshot)) {
      return null
    }

    await this.projectRepository.save(synchronizedProject)

    return synchronizedSnapshot
  }

  private async synchronizeGitBinding(project: Project): Promise<Project> {
    const inspection = await this.gitWorkspacePort.inspectRepository(project.directory)

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
}

function areProjectSnapshotsEqual(left: ProjectSnapshot, right: ProjectSnapshot): boolean {
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
