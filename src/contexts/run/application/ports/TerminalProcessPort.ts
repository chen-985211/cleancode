export interface TerminalOutputEvent {
  readonly sessionId: string
  readonly data: string
}

export interface TerminalExitEvent {
  readonly sessionId: string
  readonly exitCode: number | null
}

export interface TerminalWorkingDirectorySnapshot {
  readonly sessionId: string
  readonly workingDirectory: string
}

export interface StartTerminalProcessCommand {
  readonly sessionId: string
  readonly workingDirectory: string
  readonly shell?: string
  readonly launchCommand?: string
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
  stop(sessionId: string): void
  disposeAll(): void
}
