import { Project } from '../../domain/aggregates/Project'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { GitWorkspacePort } from '../ports/GitWorkspacePort'
import type { ProjectRepository } from '../ports/ProjectRepository'
import {
  noopWorkspaceAgentLifecyclePort,
  type WorkspaceAgentLifecyclePort
} from '../ports/WorkspaceAgentLifecyclePort'
import {
  noopWorkspaceRunLifecyclePort,
  type WorkspaceRunLifecyclePort,
  type WorkspaceRunStartGateLease
} from '../ports/WorkspaceRunLifecyclePort'
import { ProjectWorkspaceTransactionCoordinator } from './ProjectWorkspaceTransactionCoordinator'

export interface CheckoutMainWorkspaceBranchCommand {
  readonly projectDirectory: string
  readonly branchName: string
}

export class CheckoutMainWorkspaceBranchUseCase {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly gitWorkspacePort: GitWorkspacePort,
    private readonly workspaceAgentLifecyclePort: WorkspaceAgentLifecyclePort = noopWorkspaceAgentLifecyclePort,
    private readonly transactionCoordinator = new ProjectWorkspaceTransactionCoordinator(),
    private readonly workspaceRunLifecyclePort: WorkspaceRunLifecyclePort = noopWorkspaceRunLifecyclePort
  ) {}

  async execute(command: CheckoutMainWorkspaceBranchCommand): Promise<ProjectSnapshot> {
    return this.transactionCoordinator.run(command.projectDirectory, () =>
      this.executeTransaction(command)
    )
  }

  private async executeTransaction(
    command: CheckoutMainWorkspaceBranchCommand
  ): Promise<ProjectSnapshot> {
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
      throw createDirtyMainWorkspaceError()
    }

    const agentLease = await this.workspaceAgentLifecyclePort.suspend(project.directory)
    let runLease: WorkspaceRunStartGateLease | null = null
    let checkoutCompleted = false
    let canReleaseAgentLease = true
    let canReleaseRunLease = true
    let resolvesQuarantine = false

    try {
      if (!(await this.gitWorkspacePort.isWorkingTreeClean(project.directory))) {
        throw createDirtyMainWorkspaceError()
      }
      runLease = await this.workspaceRunLifecyclePort.disposeWorkspace({
        projectDirectory: project.directory,
        workspaceName: 'main'
      })
      await this.gitWorkspacePort.checkoutBranch({
        repositoryDirectory: project.directory,
        branchName
      })
      checkoutCompleted = true

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
      resolvesQuarantine = true
      return updatedProject.toSnapshot()
    } catch (error) {
      if (checkoutCompleted) {
        if (inspection.currentBranch) {
          try {
            await this.gitWorkspacePort.checkoutBranch({
              repositoryDirectory: project.directory,
              branchName: inspection.currentBranch
            })
            resolvesQuarantine = true
          } catch {
            canReleaseAgentLease = false
            canReleaseRunLease = false
          }
        } else {
          canReleaseAgentLease = false
          canReleaseRunLease = false
        }
      }
      if (canReleaseAgentLease && agentLease.wasSuspended) {
        await agentLease.resume().catch(() => undefined)
      }
      throw error
    } finally {
      if (!canReleaseAgentLease) agentLease.quarantine()
      else if (resolvesQuarantine) agentLease.resolve()
      else agentLease.release()
      if (runLease) {
        if (!canReleaseRunLease) runLease.quarantine()
        else if (resolvesQuarantine) runLease.resolve()
        else runLease.release()
      }
    }
  }
}

function normalizeBranchName(branchName: string): string {
  const normalizedBranchName = branchName.trim()

  if (!normalizedBranchName) {
    throw createExpectedAppError('GIT_BRANCH_NOT_FOUND', 'Git branch cannot be empty.')
  }

  return normalizedBranchName
}

function createDirtyMainWorkspaceError() {
  return createExpectedAppError(
    'MAIN_WORKSPACE_HAS_UNCOMMITTED_CHANGES',
    'Main workspace has uncommitted changes.'
  )
}
