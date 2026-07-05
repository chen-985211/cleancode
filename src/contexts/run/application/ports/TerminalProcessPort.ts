export interface TerminalOutputEvent {
  readonly sessionId: string
  readonly data: string
}

export interface TerminalExitEvent {
  readonly sessionId: string
  readonly exitCode: number | null
}

export interface StartTerminalProcessCommand {
  readonly sessionId: string
  readonly workingDirectory: string
  readonly shell?: string
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
  stop(sessionId: string): void
  disposeAll(): void
}
