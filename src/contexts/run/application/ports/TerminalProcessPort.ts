import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'

export interface TerminalOutputEvent {
  readonly scope: TerminalRunScope
  readonly sessionId: string
  readonly data: string
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

export interface StartTerminalProcessCommand {
  readonly scope: TerminalRunScope
  readonly workingDirectory: string
  readonly shell?: string
  readonly launchCommand?: string
  readonly environment?: Readonly<Record<string, string>>
  readonly columns: number
  readonly rows: number
  readonly onOutput: (event: TerminalOutputEvent) => void
  readonly onExit: (event: TerminalExitEvent) => void
}

export interface TerminalProcessHandle {
  readonly processId: number
}

export interface TerminalProcessPort {
  start(command: StartTerminalProcessCommand): Promise<TerminalProcessHandle>
  write(sessionId: string, input: string): void
  resize(sessionId: string, columns: number, rows: number): void
  readWorkingDirectory(sessionId: string): Promise<string | null>
  stop(sessionId: string): Promise<void>
  disposeAll(): Promise<void>
}
