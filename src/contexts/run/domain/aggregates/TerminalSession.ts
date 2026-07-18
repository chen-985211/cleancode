import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { TerminalRunScope } from '../value-objects/TerminalRunScope'

export type TerminalSessionStatus = 'idle' | 'running' | 'stopping' | 'exited' | 'failed'

export interface TerminalSessionSnapshot extends TerminalRunScope {
  readonly id: string
  readonly terminalBlockId: string
  readonly workingDirectory: string
  readonly processId: number | null
  readonly status: TerminalSessionStatus
  readonly inputHistory: readonly string[]
  readonly exitCode: number | null
  readonly failureReason: string | null
}

export interface CreateTerminalSessionInput {
  readonly scope: TerminalRunScope
  readonly workingDirectory: string
}

export class TerminalSession {
  private processIdValue: number | null = null
  private statusValue: TerminalSessionStatus = 'idle'
  private readonly recordedInput: string[] = []
  private exitCodeValue: number | null = null
  private failureReasonValue: string | null = null

  private constructor(
    public readonly scope: TerminalRunScope,
    public readonly workingDirectory: string
  ) {}

  static create(input: CreateTerminalSessionInput): TerminalSession {
    return new TerminalSession(input.scope, input.workingDirectory)
  }

  get id(): string {
    return this.scope.sessionId
  }

  get terminalBlockId(): string {
    return this.scope.blockId
  }

  get workspaceName(): string {
    return this.scope.workspaceName
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
      throw createExpectedAppError(
        'TERMINAL_SESSION_NOT_RUNNING',
        'Terminal session is not running.'
      )
    }

    this.recordedInput.push(input)
  }

  markStopping(): void {
    if (this.statusValue === 'running') {
      this.statusValue = 'stopping'
    }
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
      ...this.scope,
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
