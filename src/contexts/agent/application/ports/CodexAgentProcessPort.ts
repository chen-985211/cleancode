import type { AgentPtyExitEvent, AgentPtyOutputEvent } from '../dto/AgentSessionProtocol'

export interface StartCodexAgentProcessCommand {
  readonly cleancodeMcp?: {
    readonly bearerToken: string
    readonly serverUrl: string
  }
  readonly columns: number
  readonly onCodexThreadIdentified: (threadId: string) => void
  readonly onExit: (event: Omit<AgentPtyExitEvent, 'agentId'>) => void
  readonly onOutput: (event: Omit<AgentPtyOutputEvent, 'agentId'>) => void
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
