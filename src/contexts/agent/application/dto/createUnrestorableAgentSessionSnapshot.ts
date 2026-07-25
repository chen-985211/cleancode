import type { AgentSessionSnapshot, AgentTerminalSourceTheme } from './AgentSessionProtocol'

export function createUnrestorableAgentSessionSnapshot(input: {
  readonly agentId: string
  readonly gitBranch: string | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly providerId: string
  readonly sessionId: string
  readonly terminalSourceTheme: AgentTerminalSourceTheme
  readonly workspaceDirectory: string
  readonly workspaceName: string
}): AgentSessionSnapshot {
  return {
    agentId: input.agentId,
    gitBranch: input.gitBranch,
    projectDirectory: input.projectDirectory,
    projectId: input.projectId,
    providerId: input.providerId,
    providerSessionRef: null,
    runtime: {
      activity: { status: 'unavailable' },
      binding: { status: 'persistence_failed' },
      launch: {
        exitCode: null,
        failureKind: 'restore',
        generation: 0,
        launchId: null,
        status: 'failed'
      },
      mcp: { status: 'inactive' },
      revision: 1,
      terminal: {
        exitCode: null,
        processId: null,
        status: 'not_started',
        stopReason: null,
        viewIdentity: null
      }
    },
    sessionId: input.sessionId,
    terminalSourceTheme: input.terminalSourceTheme,
    workspaceDirectory: input.workspaceDirectory,
    workspaceName: input.workspaceName
  }
}
