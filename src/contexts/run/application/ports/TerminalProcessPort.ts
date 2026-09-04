import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'
import type { TerminalPrivateOutputControl } from '../dto/TerminalPrivateOutputControl'

export type TerminalLaunchMode = 'command' | 'interactive'

export interface TerminalProcessOutputEvent {
  readonly scope: TerminalRunScope
  readonly sessionId: string
  readonly data: string
  /** Present only when an external runtime provider already accepted this output into its model. */
  readonly sequence?: number
}

export interface TerminalOutputEvent extends TerminalProcessOutputEvent {
  readonly sequence: number
}

export interface TerminalExitEvent {
  readonly scope: TerminalRunScope
  readonly sessionId: string
  readonly exitCode: number | null
}

export interface TerminalWorkingDirectorySnapshot {
  readonly sessionId: string
  readonly workingDirectory: string
}

export interface TerminalWorkingDirectoryChangedEvent extends TerminalWorkingDirectorySnapshot {
  readonly scope: TerminalRunScope
  readonly revision: number
}

export interface StartTerminalProcessCommand {
  readonly scope: TerminalRunScope
  readonly workingDirectory: string
  readonly terminalSourceTheme?: TerminalSourceTheme
  readonly shell?: string
  readonly launchCommand?: string
  readonly launchMode?: TerminalLaunchMode
  readonly sessionKind?: 'interactive' | 'direct' | 'workflow'
  readonly environment?: Readonly<Record<string, string>>
  readonly privateOutputControl?: TerminalPrivateOutputControl
  readonly columns: number
  readonly rows: number
  readonly onOutput: (event: TerminalProcessOutputEvent) => void
  readonly onExit: (event: TerminalExitEvent) => void
}

export interface TerminalProcessHandle {
  readonly processId: number
}

export interface ForegroundJobProcessIdentity {
  readonly generation: number
  readonly launchId: string
  readonly sessionId: string
}

export interface LaunchForegroundJobProcessCommand extends ForegroundJobProcessIdentity {
  readonly args: readonly string[]
  readonly environment: Readonly<Record<string, string>>
  readonly executable: string
  /** POSIX search path appended after the live shell PATH, unless environment sets PATH. */
  readonly fallbackPath?: string
  readonly onExit: (
    event: ForegroundJobProcessIdentity & { readonly exitCode: number | null }
  ) => void
  readonly onStarted: (event: ForegroundJobProcessIdentity) => void
}

export interface TerminalProcessPort {
  launchForegroundJob?(command: LaunchForegroundJobProcessCommand): void
  start(command: StartTerminalProcessCommand): Promise<TerminalProcessHandle>
  write(sessionId: string, input: string): void
  resize(sessionId: string, columns: number, rows: number): void
  pauseOutput(sessionId: string): void
  resumeOutput(sessionId: string): void
  readWorkingDirectory(sessionId: string): Promise<string | null>
  stop(sessionId: string): Promise<void>
  disposeAll(): Promise<void>
}
