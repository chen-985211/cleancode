import type { TerminalSessionSnapshot } from '../dto/TerminalSessionSnapshot'
import type { TerminalExitEvent, TerminalOutputEvent } from './TerminalProcessPort'

export interface StartWorkflowRuntimeCommand {
  readonly blockId: string
  readonly workspaceName: string
  readonly workingDirectory: string
  readonly launchCommand: string
  readonly shell?: string
  readonly columns?: number
  readonly rows?: number
  readonly onOutput: (event: TerminalOutputEvent) => void
  readonly onExit: (event: TerminalExitEvent) => void
}

export interface TerminalWorkflowRuntimePort {
  startCommand(command: StartWorkflowRuntimeCommand): Promise<TerminalSessionSnapshot>
  startInteractive(command: StartWorkflowRuntimeCommand): Promise<TerminalSessionSnapshot>
  stop(sessionId: string): void
}
