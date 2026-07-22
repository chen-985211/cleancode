import type {
  AgentSessionSnapshot,
  AgentTerminalSourceTheme
} from '../../contexts/agent/application/dto/AgentSessionProtocol'

export function createDisabledAgentSessionSnapshot(command: {
  readonly agentId: string
  readonly gitBranch?: string | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly providerId?: string
  readonly terminalSourceTheme: AgentTerminalSourceTheme
  readonly workspaceDirectory: string
  readonly workspaceName: string
}): AgentSessionSnapshot {
  return {
    activity: 'unavailable',
    agentId: command.agentId,
    gitBranch: command.gitBranch ?? null,
    processId: null,
    projectDirectory: command.projectDirectory,
    projectId: command.projectId,
    providerId: command.providerId ?? 'codex',
    providerSessionRef: null,
    sessionId: `test-agent-${command.workspaceName}`,
    status: 'exited',
    terminalViewIdentity: null,
    terminalSourceTheme: command.terminalSourceTheme,
    workspaceDirectory: command.workspaceDirectory,
    workspaceName: command.workspaceName
  }
}
