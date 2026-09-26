import type { ProjectIssueReference } from '../../domain/value-objects/ProjectIssue'

export interface GitHubRepositorySnapshot {
  readonly name: string
  readonly defaultBranch: string
}
export interface ProjectIssueSnapshot extends ProjectIssueReference {
  readonly body: string
  readonly state: 'OPEN' | 'CLOSED'
  readonly labels: readonly string[]
  readonly assignees: readonly string[]
}
export interface ListProjectIssuesQuery {
  readonly projectDirectory: string
  readonly search?: string
  readonly assignedToMe?: boolean
  readonly label?: string
  readonly limit?: number
}
export interface ProjectIssuesSnapshot {
  readonly repository: GitHubRepositorySnapshot
  readonly issues: readonly ProjectIssueSnapshot[]
  readonly hasMore: boolean
}
export interface ProjectIssueQuery {
  readonly projectDirectory: string
  readonly repository: string
  readonly number: number
}
export interface PrepareIssueWorkspaceQuery extends ProjectIssueQuery {
  readonly baseBranch: string
}
export interface StartIssueWorkspaceCommand extends PrepareIssueWorkspaceQuery {
  readonly branchName: string
  readonly operationId?: string
}
export type IssueWorkspacePhase = 'preparing' | 'creating'
export interface IssueWorkspaceProgress {
  readonly operationId: string
  readonly phase: IssueWorkspacePhase
}
