import type {
  TerminalModelIdentity,
  TerminalModelDiagnosticsSnapshot,
  TerminalSnapshot
} from '../dto/TerminalModelSnapshot'

export interface SequencedTerminalOutput {
  readonly sequence: number
  readonly data: string
}

export interface TerminalViewOutputEvent {
  readonly viewId: string
  readonly scope: TerminalModelIdentity
  readonly sessionId: string
  readonly output: SequencedTerminalOutput
}

export interface CreateTerminalModelCommand {
  readonly identity: TerminalModelIdentity
  readonly columns: number
  readonly rows: number
  readonly workingDirectory: string
  readonly onQueryResponse: (response: string) => void
  readonly onFlowControlChange: (isPaused: boolean) => void
}

export interface AttachTerminalViewCommand {
  readonly identity: TerminalModelIdentity
  readonly viewId: string
  readonly onOutput: (event: TerminalViewOutputEvent) => void
}

export interface TerminalModelPort {
  create(command: CreateTerminalModelCommand): void
  acceptOutput(identity: TerminalModelIdentity, data: string): SequencedTerminalOutput
  attachView(command: AttachTerminalViewCommand): Promise<TerminalSnapshot>
  detachView(identity: TerminalModelIdentity, viewId: string): Promise<void>
  flush(identity: TerminalModelIdentity): Promise<void>
  resize(identity: TerminalModelIdentity, columns: number, rows: number): void
  updateWorkingDirectory(identity: TerminalModelIdentity, workingDirectory: string): void
  retire(identity: TerminalModelIdentity): void
  disposeAll(): void
  getDiagnostics(): TerminalModelDiagnosticsSnapshot
}
