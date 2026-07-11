import { Project } from '../../domain/aggregates/Project'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { GitWorkspacePort } from '../ports/GitWorkspacePort'
import type { ProjectRepository } from '../ports/ProjectRepository'
import type { WorkspaceAgentLifecyclePort } from '../ports/WorkspaceAgentLifecyclePort'

export interface CheckoutMainWorkspaceBranchCommand {
  readonly projectDirectory: string
  readonly branchName: string
}

export class CheckoutMainWorkspaceBranchUseCase {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly gitWorkspacePort: GitWorkspacePort,
    private readonly workspaceAgentLifecyclePort: WorkspaceAgentLifecyclePort = noopWorkspaceAgentLifecyclePort
  ) {}

  async execute(command: CheckoutMainWorkspaceBranchCommand): Promise<ProjectSnapshot> {
    const projectSnapshot = await this.projectRepository.findByDirectory(command.projectDirectory)

    if (!projectSnapshot) {
      throw createExpectedAppError('PROJECT_NOT_FOUND', 'Project was not found.')
    }

    const branchName = normalizeBranchName(command.branchName)
    const project = Project.fromSnapshot(projectSnapshot)
    const inspection = await this.gitWorkspacePort.inspectRepository(project.directory)

    if (!inspection.isGitRepository) {
      throw createExpectedAppError('NOT_GIT_REPOSITORY', 'Project is not a Git repository.')
    }

    const targetBranch = inspection.branches.find((branch) => branch.name === branchName)

    if (!targetBranch) {
      throw createExpectedAppError('GIT_BRANCH_NOT_FOUND', 'Git branch was not found.')
    }

    if (targetBranch.worktreeDirectory && !targetBranch.isCurrent) {
      throw createExpectedAppError(
        'GIT_BRANCH_CHECKED_OUT_IN_WORKTREE',
        'Git branch is already checked out in another worktree.'
      )
    }

    if (!(await this.gitWorkspacePort.isWorkingTreeClean(project.directory))) {
      throw createExpectedAppError(
        'MAIN_WORKSPACE_HAS_UNCOMMITTED_CHANGES',
        'Main workspace has uncommitted changes.'
      )
    }

    const wasAgentSuspended = await this.workspaceAgentLifecyclePort.suspend(project.directory)

    try {
      await this.gitWorkspacePort.checkoutBranch({
        repositoryDirectory: project.directory,
        branchName
      })
    } catch (error) {
      if (wasAgentSuspended) {
        await this.workspaceAgentLifecyclePort.resume(project.directory)
      }

      throw error
    }

    const worktrees = inspection.branches
      .filter((branch) => branch.worktreeDirectory && !branch.isCurrent)
      .map((branch) => ({
        branchName: branch.name,
        directory: branch.worktreeDirectory ?? project.directory
      }))
    const updatedProject = project
      .syncGitBranchWorkspaces({
        mainDirectory: project.directory,
        mainGitBranch: branchName,
        worktrees
      })
      .switchCurrentWorkspace('main')

    await this.projectRepository.save(updatedProject)

    return updatedProject.toSnapshot()
  }
}

const noopWorkspaceAgentLifecyclePort: WorkspaceAgentLifecyclePort = {
  resume: async () => undefined,
  suspend: async () => false
}

function normalizeBranchName(branchName: string): string {
  const normalizedBranchName = branchName.trim()

  if (!normalizedBranchName) {
    throw createExpectedAppError('GIT_BRANCH_NOT_FOUND', 'Git branch cannot be empty.')
  }

  return normalizedBranchName
}
