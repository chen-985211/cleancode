import type { TerminalSessionSnapshot } from '../dto/TerminalSessionSnapshot'
import type { TerminalExitEvent, TerminalOutputEvent } from './TerminalProcessPort'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'

export interface StartWorkflowRuntimeCommand {
  readonly projectId: string
  readonly projectDirectory: string
  readonly blockId: string
  readonly workspaceId: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly workingDirectory: string
  readonly runId: string
  readonly launchCommand: string
  readonly terminalSourceTheme?: TerminalSourceTheme
  readonly shell?: string
  readonly columns?: number
  readonly rows?: number
  readonly onOutput: (event: TerminalOutputEvent) => void
  readonly onExit: (event: TerminalExitEvent) => void
}

export interface TerminalWorkflowRuntimePort {
  startCommand(command: StartWorkflowRuntimeCommand): Promise<TerminalSessionSnapshot>
  stop(sessionId: string): Promise<void>
  stopPreservingHistory(sessionId: string): Promise<TerminalExitEvent | null>
}
