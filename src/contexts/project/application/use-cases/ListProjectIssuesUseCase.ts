import type { ProjectIssueScope } from '../services/ProjectIssueScope'
import type { GitHubIssuePort } from '../ports/GitHubIssuePort'
import type { ListProjectIssuesQuery, ProjectIssuesSnapshot } from '../dto/ProjectIssues'
import { AppError, isAppError } from '../../../../shared-kernel/application/errors/AppError'

export class ListProjectIssuesUseCase {
  constructor(
    private readonly scope: ProjectIssueScope,
    private readonly github: GitHubIssuePort
  ) {}
  async execute(query: ListProjectIssuesQuery): Promise<ProjectIssuesSnapshot> {
    const project = await this.scope.require(query.projectDirectory)
    const repository = await this.github.repository(project.directory, project.issueRepository)
    const limit = Math.max(1, Math.min(query.limit ?? 50, 500))
    try {
      const issues = await this.github.list(project.directory, repository.name, {
        ...query,
        limit: limit + 1
      })
      return { repository, issues: issues.slice(0, limit), hasMore: issues.length > limit }
    } catch (error) {
      if (!isAppError(error)) throw error
      throw new AppError({
        ...error,
        message: error.message,
        details: { ...error.details, repository: repository.name }
      })
    }
  }
}
