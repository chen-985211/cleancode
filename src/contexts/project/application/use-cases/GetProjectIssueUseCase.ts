import type { ProjectIssueScope } from '../services/ProjectIssueScope'
import { ProjectIssueReadCache } from '../services/ProjectIssueReadCache'
import type { GitHubIssuePort } from '../ports/GitHubIssuePort'
import type { ProjectIssueQuery } from '../dto/ProjectIssues'
import { normalizeIssueRepository } from '../../domain/value-objects/ProjectIssue'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export class GetProjectIssueUseCase {
  constructor(
    private readonly scope: ProjectIssueScope,
    private readonly github: GitHubIssuePort,
    private readonly cache = new ProjectIssueReadCache()
  ) {}
  async execute(query: ProjectIssueQuery) {
    const project = await this.scope.require(query.projectDirectory)
    const repository = normalizeIssueRepository(query.repository)
    if (
      project.issueRepository &&
      project.issueRepository.toLowerCase() !== repository.toLowerCase()
    )
      throw createExpectedAppError('PROJECT_ISSUE_INVALID', 'Repository selection changed.')
    const issue = await this.github.issue(project.directory, repository, query.number)
    this.cache.rememberIssue(project, issue)
    return issue
  }
}
