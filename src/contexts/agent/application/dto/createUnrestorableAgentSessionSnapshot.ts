import type { AgentSessionSnapshot, AgentTerminalSourceTheme } from './AgentSessionProtocol'

export function createUnrestorableAgentSessionSnapshot(input: {
  readonly agentId: string
  readonly gitBranch: string | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly providerId?: string
  readonly sessionId: string
  readonly terminalSourceTheme: AgentTerminalSourceTheme
  readonly workspaceDirectory: string
  readonly workspaceName: string
}): AgentSessionSnapshot {
  return {
    activity: 'unavailable',
    agentId: input.agentId,
    gitBranch: input.gitBranch,
    processId: null,
    projectDirectory: input.projectDirectory,
    projectId: input.projectId,
    providerId: input.providerId ?? 'codex',
    providerSessionRef: null,
    sessionId: input.sessionId,
    status: 'restore_failed',
    terminalViewIdentity: null,
    terminalSourceTheme: input.terminalSourceTheme,
    workspaceDirectory: input.workspaceDirectory,
    workspaceName: input.workspaceName
  }
}
