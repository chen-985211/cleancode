import type { GitHubRepositorySnapshot } from '../dto/ProjectIssues'
import type { ProjectSnapshot } from '../dto/ProjectSnapshot'
import {
  normalizeProjectIssue,
  type ProjectIssueReference
} from '../../domain/value-objects/ProjectIssue'

// Only provider-read references are reused; this is not a persisted Issue store.
export class ProjectIssueReadCache {
  private readonly repositories = new Map<string, GitHubRepositorySnapshot>()
  private readonly issues = new Map<string, ProjectIssueReference>()

  repository(project: ProjectSnapshot): GitHubRepositorySnapshot | undefined {
    return this.repositories.get(this.scope(project))
  }
  rememberRepository(project: ProjectSnapshot, repository: GitHubRepositorySnapshot): void {
    this.remember(this.repositories, this.scope(project), { ...repository }, 128)
  }
  issue(
    project: ProjectSnapshot,
    repository: string,
    number: number
  ): ProjectIssueReference | undefined {
    return this.issues.get(this.issueKey(project, repository, number))
  }
  rememberIssue(project: ProjectSnapshot, issue: ProjectIssueReference): void {
    this.remember(
      this.issues,
      this.issueKey(project, issue.repository, issue.number),
      normalizeProjectIssue(issue),
      1000
    )
  }
  private scope(project: ProjectSnapshot): string {
    return JSON.stringify([
      project.id,
      project.directory,
      project.issueRepository?.toLowerCase() ?? null
    ])
  }
  private issueKey(project: ProjectSnapshot, repository: string, number: number): string {
    return JSON.stringify([this.scope(project), repository.toLowerCase(), number])
  }
  private remember<T>(entries: Map<string, T>, key: string, value: T, limit: number): void {
    entries.delete(key)
    entries.set(key, value)
    while (entries.size > limit) entries.delete(entries.keys().next().value!)
  }
}
