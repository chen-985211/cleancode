/** Resolves an existing directory within the Agent's repository independently of canvas scope. */
export interface AgentExecutionDirectoryPort {
  resolve(command: {
    readonly workspaceDirectory: string
    readonly executionDirectory: string
  }): Promise<string | null>
}

export const homeAgentExecutionDirectory: AgentExecutionDirectoryPort = {
  resolve: async ({ workspaceDirectory, executionDirectory }) =>
    executionDirectory === workspaceDirectory ? workspaceDirectory : null
}
