import type { AgentSessionSnapshot } from '../../contexts/agent/application/dto/AgentSessionProtocol'

export function createDisabledAgentSessionSnapshot(command: {
  readonly agentId: string
  readonly gitBranch?: string | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly workspaceDirectory: string
  readonly workspaceName: string
}): AgentSessionSnapshot {
  return {
    agentId: command.agentId,
    codexThreadId: null,
    gitBranch: command.gitBranch ?? null,
    processId: null,
    projectDirectory: command.projectDirectory,
    projectId: command.projectId,
    sessionId: `test-agent-${command.workspaceName}`,
    status: 'exited',
    workspaceDirectory: command.workspaceDirectory,
    workspaceName: command.workspaceName
  }
}
