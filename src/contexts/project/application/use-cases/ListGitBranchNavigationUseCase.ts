import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { GitBranchNavigationSnapshot } from '../dto/GitBranchNavigationSnapshot'
import type { GitWorkspacePort } from '../ports/GitWorkspacePort'
import type { ProjectRepository } from '../ports/ProjectRepository'

export interface ListGitBranchNavigationCommand {
  readonly projectDirectory: string
}

export class ListGitBranchNavigationUseCase {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly gitWorkspacePort: GitWorkspacePort
  ) {}

  async execute(command: ListGitBranchNavigationCommand): Promise<GitBranchNavigationSnapshot> {
    const project = await this.projectRepository.findByDirectory(command.projectDirectory)

    if (!project) {
      throw createExpectedAppError('PROJECT_NOT_FOUND', 'Project was not found.')
    }

    const inspection = await this.gitWorkspacePort.inspectRepository(project.directory)

    if (!inspection.isGitRepository) {
      return { branches: [] }
    }

    const mainWorkspace = project.workspaces.find((workspace) => workspace.name === 'main')
    const mainGitBranch = mainWorkspace?.gitBranch ?? inspection.currentBranch

    return {
      branches: inspection.branches.map((branch) => {
        const isMainWorkspaceBranch = branch.name === mainGitBranch
        const isCheckedOutInAnotherWorktree = Boolean(
          branch.worktreeDirectory && !isMainWorkspaceBranch
        )

        return {
          name: branch.name,
          isCurrent: isMainWorkspaceBranch,
          isMainWorkspaceBranch,
          worktreeDirectory: branch.worktreeDirectory,
          isSelectableInMainWorkspace: !isMainWorkspaceBranch && !isCheckedOutInAnotherWorktree,
          isLocked: branch.isLocked,
          lockReason: branch.lockReason
        }
      })
    }
  }
}
