import type { AgentPtyExitEvent, AgentPtyOutputEvent } from '../dto/AgentSessionProtocol'

export interface StartCodexAgentProcessCommand {
  readonly bearerToken: string
  readonly columns: number
  readonly mcpServerUrl: string
  readonly onCodexThreadIdentified: (threadId: string) => void
  readonly onExit: (event: AgentPtyExitEvent) => void
  readonly onOutput: (event: AgentPtyOutputEvent) => void
  readonly rows: number
  readonly resumeThreadId?: string
  readonly sessionId: string
  readonly workspaceDirectory: string
}

export interface CodexAgentProcessHandle {
  readonly processId: number
}

export interface CodexAgentProcessPort {
  start(command: StartCodexAgentProcessCommand): Promise<CodexAgentProcessHandle>
  write(sessionId: string, input: string): void
  resize(sessionId: string, columns: number, rows: number): void
  stop(sessionId: string): Promise<void>
  disposeAll(): Promise<void>
}
