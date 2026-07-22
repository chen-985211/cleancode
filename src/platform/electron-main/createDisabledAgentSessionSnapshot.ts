import type {
  AgentSessionSnapshot,
  AgentTerminalSourceTheme
} from '../../contexts/agent/application/dto/AgentSessionProtocol'

export function createDisabledAgentSessionSnapshot(command: {
  readonly agentId: string
  readonly gitBranch?: string | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly providerId: string
  readonly terminalSourceTheme: AgentTerminalSourceTheme
  readonly workspaceDirectory: string
  readonly workspaceName: string
}): AgentSessionSnapshot {
  return {
    agentId: command.agentId,
    gitBranch: command.gitBranch ?? null,
    projectDirectory: command.projectDirectory,
    projectId: command.projectId,
    providerId: command.providerId,
    providerSessionRef: null,
    runtime: {
      activity: { status: 'unavailable' },
      binding: { status: 'unbound' },
      launch: {
        exitCode: null,
        failureKind: null,
        generation: 0,
        launchId: null,
        status: 'not_started'
      },
      mcp: { status: 'disabled' },
      revision: 0,
      terminal: {
        exitCode: null,
        processId: null,
        status: 'exited',
        viewIdentity: null
      }
    },
    sessionId: `test-agent-${command.workspaceName}`,
    terminalSourceTheme: command.terminalSourceTheme,
    workspaceDirectory: command.workspaceDirectory,
    workspaceName: command.workspaceName
  }
}
