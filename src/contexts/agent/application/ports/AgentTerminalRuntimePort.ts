import type { AgentLaunchPlan } from './AgentProviderContribution'
import type { AgentTerminalViewIdentity } from '../dto/AgentSessionProtocol'

interface AgentTerminalHandle {
  readonly processId: number
  readonly terminalId: string
  readonly viewIdentity?: AgentTerminalViewIdentity
}

export interface OpenAgentTerminalCommand {
  readonly agentId: string
  readonly columns: number
  readonly gitBranch: string | null
  readonly onTerminalExit: (exitCode: number | null) => void
  readonly projectDirectory: string
  readonly projectId: string
  readonly rows: number
  readonly sessionId: string
  readonly terminalSourceTheme: 'dark' | 'light'
  readonly workspaceDirectory: string
  readonly workspaceName: string
}

interface AgentTerminalLaunchEvent {
  readonly exitCode: number | null
  readonly generation: number
  readonly launchId: string
}

export interface AgentTerminalRuntimePort {
  disposeAll(): Promise<void>
  launch(command: {
    readonly onExit: (event: AgentTerminalLaunchEvent) => void
    readonly onStarted?: (event: Omit<AgentTerminalLaunchEvent, 'exitCode'>) => void
    readonly plan: AgentLaunchPlan
    readonly sessionId: string
  }): { readonly generation: number; readonly launchId: string }
  open(command: OpenAgentTerminalCommand): Promise<AgentTerminalHandle>
  releaseApplicationShutdown(): void
  resize(sessionId: string, columns: number, rows: number): void
  stop(sessionId: string): Promise<void>
  write(sessionId: string, input: string): void
}
