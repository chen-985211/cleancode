export type TerminalSessionStatus = 'idle' | 'running' | 'exited' | 'failed'

export interface TerminalSessionSnapshot {
  readonly id: string
  readonly terminalBlockId: string
  readonly workspaceName: string
  readonly workingDirectory: string
  readonly processId: number | null
  readonly status: TerminalSessionStatus
  readonly inputHistory: readonly string[]
  readonly exitCode: number | null
  readonly failureReason: string | null
}

export interface CreateTerminalSessionInput {
  readonly id?: string
  readonly terminalBlockId: string
  readonly workspaceName: string
  readonly workingDirectory: string
}

export class TerminalSession {
  private processIdValue: number | null = null
  private statusValue: TerminalSessionStatus = 'idle'
  private readonly recordedInput: string[] = []
  private exitCodeValue: number | null = null
  private failureReasonValue: string | null = null

  private constructor(
    public readonly id: string,
    public readonly terminalBlockId: string,
    public readonly workspaceName: string,
    public readonly workingDirectory: string
  ) {}

  static create(input: CreateTerminalSessionInput): TerminalSession {
    return new TerminalSession(
      input.id ?? createSessionId(),
      input.terminalBlockId,
      input.workspaceName,
      input.workingDirectory
    )
  }

  get processId(): number | null {
    return this.processIdValue
  }

  get status(): TerminalSessionStatus {
    return this.statusValue
  }

  get inputHistory(): readonly string[] {
    return this.recordedInput
  }

  markRunning(input: { readonly processId: number }): void {
    this.processIdValue = input.processId
    this.statusValue = 'running'
    this.exitCodeValue = null
    this.failureReasonValue = null
  }

  recordInput(input: string): void {
    if (this.statusValue !== 'running') {
      throw new Error('Terminal session is not running.')
    }

    this.recordedInput.push(input)
  }

  markExited(input: { readonly exitCode: number | null }): void {
    this.statusValue = 'exited'
    this.exitCodeValue = input.exitCode
  }

  markFailed(input: { readonly reason: string }): void {
    this.statusValue = 'failed'
    this.failureReasonValue = input.reason
  }

  toSnapshot(): TerminalSessionSnapshot {
    return {
      id: this.id,
      terminalBlockId: this.terminalBlockId,
      workspaceName: this.workspaceName,
      workingDirectory: this.workingDirectory,
      processId: this.processIdValue,
      status: this.statusValue,
      inputHistory: this.recordedInput,
      exitCode: this.exitCodeValue,
      failureReason: this.failureReasonValue
    }
  }
}

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `terminal-session-${Date.now()}-${Math.random()}`
}
