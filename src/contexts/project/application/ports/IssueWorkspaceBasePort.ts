export interface IssueWorkspaceBasePort {
  resolve(directory: string, repository: string, branch: string): Promise<string>
}
