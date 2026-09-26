import type { ProjectIssueScope } from '../services/ProjectIssueScope'
import { ProjectIssueReadCache } from '../services/ProjectIssueReadCache'
import type { GitHubIssuePort } from '../ports/GitHubIssuePort'
import type { IssueWorkspaceBasePort } from '../ports/IssueWorkspaceBasePort'
import type {
  IssueWorkspacePhase,
  PrepareIssueWorkspaceQuery,
  StartIssueWorkspaceCommand
} from '../dto/ProjectIssues'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import type { PrepareWorkspaceInitializationUseCase } from './PrepareWorkspaceInitializationUseCase'
import { ProjectWorkspaceTransactionCoordinator } from './ProjectWorkspaceTransactionCoordinator'
import {
  normalizeIssueRepository,
  sameProjectIssue,
  type ProjectIssueReference
} from '../../domain/value-objects/ProjectIssue'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

interface Dependencies {
  readonly scope: Pick<ProjectIssueScope, 'require'>
  readonly github: GitHubIssuePort
  readonly cache?: ProjectIssueReadCache
  readonly base: IssueWorkspaceBasePort
  readonly preparation: Pick<PrepareWorkspaceInitializationUseCase, 'create' | 'list'>
  readonly select: (command: {
    projectDirectory: string
    workspaceId: string
  }) => Promise<ProjectSnapshot>
}

export class StartIssueWorkspaceUseCase {
  private readonly requests = new ProjectWorkspaceTransactionCoordinator()
  private readonly cache: ProjectIssueReadCache
  constructor(private readonly dependencies: Dependencies) {
    this.cache = dependencies.cache ?? new ProjectIssueReadCache()
  }
  execute(
    command: StartIssueWorkspaceCommand,
    progress?: (phase: IssueWorkspacePhase) => void
  ): Promise<ProjectSnapshot> {
    return this.requests.run(command.projectDirectory, () => this.start(command, progress))
  }
  async prepare(query: PrepareIssueWorkspaceQuery): Promise<void> {
    const context = await this.resolveContext(query)
    if (context.existing || context.pending?.baseRef) return
    await this.dependencies.base.resolve(
      context.project.directory,
      context.repository,
      query.baseBranch
    )
  }
  private async resolveContext(query: PrepareIssueWorkspaceQuery) {
    const { scope, github, preparation } = this.dependencies
    const project = await scope.require(query.projectDirectory)
    const repository = normalizeIssueRepository(query.repository)
    let selectedRepository = project.issueRepository ?? this.cache.repository(project)?.name
    if (!selectedRepository) {
      const resolved = await github.repository(project.directory)
      this.cache.rememberRepository(project, resolved)
      selectedRepository = resolved.name
    }
    if (selectedRepository.toLowerCase() !== repository.toLowerCase())
      throw createExpectedAppError('PROJECT_ISSUE_INVALID', 'Repository selection changed.')
    const operations = await preparation.list(project.directory)
    const matchesQuery = (issue?: ProjectIssueReference) =>
      Boolean(
        issue &&
        issue.repository.toLowerCase() === repository.toLowerCase() &&
        issue.number === query.number
      )
    const pendingOperations = operations.filter(
      (operation) =>
        operation.mode === 'new-workspace' &&
        operation.stage !== 'cancelled' &&
        operation.stage !== 'complete'
    )
    const issue =
      this.cache.issue(project, repository, query.number) ??
      project.workspaces.find((workspace) => matchesQuery(workspace.issue))?.issue ??
      pendingOperations.find((operation) => matchesQuery(operation.issue))?.issue ??
      (await github.issue(project.directory, repository, query.number))
    this.cache.rememberIssue(project, issue)
    return {
      project,
      repository,
      selectedRepository,
      issue,
      existing: project.workspaces.find((workspace) => sameProjectIssue(workspace.issue, issue)),
      pending: pendingOperations.find((operation) => sameProjectIssue(operation.issue, issue))
    }
  }
  private async start(
    command: StartIssueWorkspaceCommand,
    progress?: (phase: IssueWorkspacePhase) => void
  ): Promise<ProjectSnapshot> {
    progress?.('preparing')
    const { scope, base, preparation, select } = this.dependencies
    const { project, repository, selectedRepository, issue, existing, pending } =
      await this.resolveContext(command)
    if (existing)
      return select({ projectDirectory: project.directory, workspaceId: existing.workspaceId })
    const baseRef =
      pending?.baseRef ?? (await base.resolve(project.directory, repository, command.baseBranch))
    const latest = await scope.require(project.directory)
    if (
      latest.id !== project.id ||
      (latest.issueRepository ?? selectedRepository).toLowerCase() !== repository.toLowerCase()
    )
      throw createExpectedAppError('PROJECT_ISSUE_INVALID', 'Repository selection changed.')
    progress?.('creating')
    return preparation.create({
      projectDirectory: project.directory,
      branchName: pending?.branchName ?? command.branchName,
      requestId: pending?.id,
      baseRef,
      issue: pending?.issue ?? issue
    })
  }
}
