import type { AgentSessionSnapshot, AgentTerminalSourceTheme } from './AgentSessionProtocol'

export function createUnrestorableAgentSessionSnapshot(input: {
  readonly agentId: string
  readonly gitBranch: string | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly sessionId: string
  readonly terminalSourceTheme: AgentTerminalSourceTheme
  readonly workspaceDirectory: string
  readonly workspaceName: string
}): AgentSessionSnapshot {
  return {
    agentId: input.agentId,
    codexThreadId: null,
    gitBranch: input.gitBranch,
    processId: null,
    projectDirectory: input.projectDirectory,
    projectId: input.projectId,
    sessionId: input.sessionId,
    status: 'restore_failed',
    terminalSourceTheme: input.terminalSourceTheme,
    workspaceDirectory: input.workspaceDirectory,
    workspaceName: input.workspaceName
  }
}
