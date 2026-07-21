import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'

export type TerminalLaunchMode = 'command' | 'interactive'

interface TerminalProcessOutputEvent {
  readonly scope: TerminalRunScope
  readonly sessionId: string
  readonly data: string
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

export interface StartTerminalProcessCommand {
  readonly scope: TerminalRunScope
  readonly workingDirectory: string
  readonly shell?: string
  readonly launchCommand?: string
  readonly launchMode?: TerminalLaunchMode
  readonly environment?: Readonly<Record<string, string>>
  readonly columns: number
  readonly rows: number
  readonly onOutput: (event: TerminalProcessOutputEvent) => void
  readonly onExit: (event: TerminalExitEvent) => void
}

export interface TerminalProcessHandle {
  readonly processId: number
}

export interface TerminalProcessPort {
  start(command: StartTerminalProcessCommand): Promise<TerminalProcessHandle>
  write(sessionId: string, input: string): void
  resize(sessionId: string, columns: number, rows: number): void
  pauseOutput(sessionId: string): void
  resumeOutput(sessionId: string): void
  readWorkingDirectory(sessionId: string): Promise<string | null>
  stop(sessionId: string): Promise<void>
  disposeAll(): Promise<void>
}
