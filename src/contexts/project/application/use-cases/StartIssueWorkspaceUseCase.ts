import type { ProjectIssueScope } from '../services/ProjectIssueScope'
import type { GitHubIssuePort } from '../ports/GitHubIssuePort'
import type { IssueWorkspaceBasePort } from '../ports/IssueWorkspaceBasePort'
import type { StartIssueWorkspaceCommand } from '../dto/ProjectIssues'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { PrepareWorkspaceInitializationUseCase } from './PrepareWorkspaceInitializationUseCase'
import { ProjectWorkspaceTransactionCoordinator } from './ProjectWorkspaceTransactionCoordinator'
import { normalizeIssueRepository, sameProjectIssue } from '../../domain/value-objects/ProjectIssue'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

interface Dependencies {
  readonly scope: Pick<ProjectIssueScope, 'require'>
  readonly github: GitHubIssuePort
  readonly base: IssueWorkspaceBasePort
  readonly preparation: Pick<PrepareWorkspaceInitializationUseCase, 'create' | 'list'>
  readonly select: (command: {
    projectDirectory: string
    workspaceId: string
  }) => Promise<ProjectSnapshot>
}

export class StartIssueWorkspaceUseCase {
  private readonly requests = new ProjectWorkspaceTransactionCoordinator()
  constructor(private readonly dependencies: Dependencies) {}
  execute(command: StartIssueWorkspaceCommand): Promise<ProjectSnapshot> {
    return this.requests.run(command.projectDirectory, () => this.start(command))
  }
  private async start(command: StartIssueWorkspaceCommand): Promise<ProjectSnapshot> {
    const { scope, github, base, preparation, select } = this.dependencies
    const project = await scope.require(command.projectDirectory)
    const repository = normalizeIssueRepository(command.repository)
    const selectedRepository =
      project.issueRepository ?? (await github.repository(project.directory)).name
    if (selectedRepository.toLowerCase() !== repository.toLowerCase())
      throw createExpectedAppError('PROJECT_ISSUE_INVALID', 'Repository selection changed.')
    const issue = await github.issue(project.directory, repository, command.number)
    const existing = project.workspaces.find((workspace) =>
      sameProjectIssue(workspace.issue, issue)
    )
    if (existing)
      return select({ projectDirectory: project.directory, workspaceId: existing.workspaceId })
    const pending = (await preparation.list(project.directory)).find(
      (operation) =>
        operation.mode === 'new-workspace' &&
        operation.stage !== 'cancelled' &&
        operation.stage !== 'complete' &&
        sameProjectIssue(operation.issue, issue)
    )
    const baseRef =
      pending?.baseRef ?? (await base.resolve(project.directory, repository, command.baseBranch))
    // Revalidate the project after the network operation before any workspace mutation.
    const latest = await scope.require(project.directory)
    if ((latest.issueRepository ?? selectedRepository).toLowerCase() !== repository.toLowerCase())
      throw createExpectedAppError('PROJECT_ISSUE_INVALID', 'Repository selection changed.')
    return preparation.create({
      projectDirectory: project.directory,
      branchName: pending?.branchName ?? command.branchName,
      requestId: pending?.id,
      baseRef,
      issue: pending?.issue ?? issue
    })
  }
}
