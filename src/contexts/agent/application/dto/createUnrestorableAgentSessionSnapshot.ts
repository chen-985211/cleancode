import type { AgentSessionSnapshot } from './AgentSessionProtocol'

export function createUnrestorableAgentSessionSnapshot(input: {
  readonly gitBranch: string | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly sessionId: string
  readonly workspaceDirectory: string
  readonly workspaceName: string
}): AgentSessionSnapshot {
  return {
    codexThreadId: null,
    gitBranch: input.gitBranch,
    processId: null,
    projectDirectory: input.projectDirectory,
    projectId: input.projectId,
    sessionId: input.sessionId,
    status: 'restore_failed',
    workspaceDirectory: input.workspaceDirectory,
    workspaceName: input.workspaceName
  }
}
