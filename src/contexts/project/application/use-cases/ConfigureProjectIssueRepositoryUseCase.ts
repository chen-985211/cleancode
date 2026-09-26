import { Project } from '../../domain/aggregates/Project'
import { normalizeIssueRepository } from '../../domain/value-objects/ProjectIssue'
import type { ProjectIssueScope } from '../services/ProjectIssueScope'
import type { GitHubIssuePort } from '../ports/GitHubIssuePort'
import type { ProjectRepository } from '../ports/ProjectRepository'
import type { ProjectWorkspaceTransactionCoordinator } from './ProjectWorkspaceTransactionCoordinator'

export class ConfigureProjectIssueRepositoryUseCase {
  constructor(
    private readonly scope: ProjectIssueScope,
    private readonly github: GitHubIssuePort,
    private readonly projects: ProjectRepository,
    private readonly transactions: ProjectWorkspaceTransactionCoordinator
  ) {}
  async execute(command: { projectDirectory: string; repository: string }) {
    await this.scope.require(command.projectDirectory)
    const repository = await this.github.repository(
      command.projectDirectory,
      normalizeIssueRepository(command.repository)
    )
    return this.transactions.run(command.projectDirectory, async () => {
      const project = Project.fromSnapshot(
        await this.scope.require(command.projectDirectory)
      ).bindIssueRepository(repository.name)
      await this.projects.save(project)
      return project.toSnapshot()
    })
  }
}
