import { createProjectError } from '../errors/ProjectErrors'
import type { ProjectIssueReference } from '../../domain/value-objects/ProjectIssue'
import { normalizeNewBranchName } from '../../domain/value-objects/GitBranchName'
import { Project } from '../../domain/aggregates/Project'

import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { BranchWorkspaceDirectoryPort } from '../ports/BranchWorkspaceDirectoryPort'
import type { GitWorkspacePort } from '../ports/GitWorkspacePort'
import type { ProjectRepository } from '../ports/ProjectRepository'
import { ProjectWorkspaceTransactionCoordinator } from './ProjectWorkspaceTransactionCoordinator'

export interface CreateBranchWorkspaceCommand {
  readonly selectWorkspace?: boolean
  readonly baseRef?: string
  readonly issue?: ProjectIssueReference
  readonly workspaceId?: string
  readonly projectDirectory: string
  readonly branchName: string
}

export class CreateBranchWorkspaceUseCase {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly gitWorkspacePort: GitWorkspacePort,
    private readonly branchWorkspaceDirectoryPort: BranchWorkspaceDirectoryPort,
    private readonly transactionCoordinator = new ProjectWorkspaceTransactionCoordinator()
  ) {}

  async execute(
    command: CreateBranchWorkspaceCommand,
    onWorktreeCreated?: () => Promise<void>
  ): Promise<ProjectSnapshot> {
    return this.transactionCoordinator.run(command.projectDirectory, () =>
      this.executeTransaction(command, onWorktreeCreated)
    )
  }

  private async executeTransaction(
    command: CreateBranchWorkspaceCommand,
    onWorktreeCreated?: () => Promise<void>
  ): Promise<ProjectSnapshot> {
    const projectSnapshot = await this.projectRepository.findByDirectory(command.projectDirectory)

    if (!projectSnapshot) {
      throw createProjectError('PROJECT_NOT_FOUND', 'Project was not found.')
    }
    if (
      command.issue &&
      projectSnapshot.issueRepository &&
      command.issue.repository.toLowerCase() !== projectSnapshot.issueRepository.toLowerCase()
    ) {
      throw createProjectError('PROJECT_ISSUE_INVALID', 'Repository selection changed.')
    }

    const branchName = normalizeNewBranchName(command.branchName)
    const project = Project.fromSnapshot(projectSnapshot)
    const inspection = await this.gitWorkspacePort.inspectRepository(project.directory)

    if (!inspection.isGitRepository) {
      throw createProjectError('NOT_GIT_REPOSITORY', 'Project is not a Git repository.')
    }

    if (!inspection.currentBranch && !command.baseRef) {
      throw createProjectError(
        'GIT_REPOSITORY_HAS_NO_CURRENT_BRANCH',
        'Git repository has no current branch.'
      )
    }

    if (inspection.localBranches.includes(branchName)) {
      throw createProjectError('GIT_BRANCH_ALREADY_EXISTS', 'Git branch already exists.')
    }

    const worktreeDirectory = this.branchWorkspaceDirectoryPort.resolveBranchWorkspaceDirectory({
      projectDirectory: project.directory,
      branchName
    })
    const updatedProject = project.addLinkedWorktreeWorkspace({
      selectWorkspace: command.selectWorkspace,
      issue: command.issue,
      workspaceId: command.workspaceId,
      displayName: branchName,
      directory: worktreeDirectory,
      gitBranch: branchName
    })

    await this.gitWorkspacePort.createBranchWorktree({
      ...(command.baseRef ? { baseRef: command.baseRef } : {}),
      repositoryDirectory: project.directory,
      branchName,
      worktreeDirectory
    })
    await onWorktreeCreated?.()
    await this.projectRepository.save(updatedProject)

    return updatedProject.toSnapshot()
  }
}
