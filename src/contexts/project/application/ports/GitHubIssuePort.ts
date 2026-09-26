import type {
  GitHubRepositorySnapshot,
  ProjectIssueSnapshot,
  ListProjectIssuesQuery
} from '../dto/ProjectIssues'

export interface GitHubIssuePort {
  repository(directory: string, repository?: string): Promise<GitHubRepositorySnapshot>
  list(
    directory: string,
    repository: string,
    query: ListProjectIssuesQuery
  ): Promise<readonly ProjectIssueSnapshot[]>
  issue(directory: string, repository: string, number: number): Promise<ProjectIssueSnapshot>
}
