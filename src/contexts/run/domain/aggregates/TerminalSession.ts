import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { resolveTerminalOwnerRef, type TerminalRunScope } from '../value-objects/TerminalRunScope'

export type TerminalSessionStatus = 'idle' | 'running' | 'stopping' | 'exited' | 'failed'
export type TerminalSessionKind = 'interactive' | 'direct' | 'workflow'
export type TerminalRetentionPolicy =
  'terminate-on-application-exit' | 'keep-after-application-exit'
export type TerminalRecoveryKind = 'fresh' | 'warm' | 'historical' | 'ended'
export type TerminalSourceTheme = 'dark' | 'light'

export interface TerminalSessionSnapshot extends TerminalRunScope {
  readonly id: string
  readonly terminalBlockId: string
  readonly workingDirectory: string
  readonly processId: number | null
  readonly status: TerminalSessionStatus
  readonly kind: TerminalSessionKind
  readonly retentionPolicy: TerminalRetentionPolicy
  readonly recoveryKind: TerminalRecoveryKind
  readonly terminalSourceTheme: TerminalSourceTheme
  readonly inputHistory: readonly string[]
  readonly exitCode: number | null
  readonly failureReason: string | null
}

export interface CreateTerminalSessionInput {
  readonly scope: TerminalRunScope
  readonly workingDirectory: string
  readonly kind?: TerminalSessionKind
  readonly terminalSourceTheme?: TerminalSourceTheme
}

export interface ReviveTerminalSessionInput {
  readonly scope: TerminalRunScope
  readonly workingDirectory: string
  readonly kind: Exclude<TerminalSessionKind, 'workflow'>
  readonly retentionPolicy: TerminalRetentionPolicy
  readonly recoveryKind: Extract<TerminalRecoveryKind, 'warm' | 'historical'>
  readonly terminalSourceTheme?: TerminalSourceTheme
  readonly processId: number | null
  readonly inputHistory?: readonly string[]
  readonly exitCode?: number | null
  readonly failureReason?: string | null
}

export class TerminalSession {
  private processIdValue: number | null = null
  private statusValue: TerminalSessionStatus = 'idle'
  private readonly recordedInput: string[] = []
  private exitCodeValue: number | null = null
  private failureReasonValue: string | null = null
  private retentionPolicyValue: TerminalRetentionPolicy = 'terminate-on-application-exit'
  private recoveryKindValue: TerminalRecoveryKind = 'fresh'

  private constructor(
    public readonly scope: TerminalRunScope,
    public readonly workingDirectory: string,
    public readonly kind: TerminalSessionKind,
    public readonly terminalSourceTheme: TerminalSourceTheme
  ) {}

  static create(input: CreateTerminalSessionInput): TerminalSession {
    return new TerminalSession(
      input.scope,
      input.workingDirectory,
      input.kind ?? 'interactive',
      input.terminalSourceTheme ?? 'dark'
    )
  }

  static revive(input: ReviveTerminalSessionInput): TerminalSession {
    assertRetentionAllowed(input.scope, input.kind, input.retentionPolicy)
    if (input.recoveryKind === 'warm' && input.processId === null) {
      throw createExpectedAppError(
        'TERMINAL_SESSION_NOT_RUNNING',
        'A warm terminal recovery requires a live process.'
      )
    }

    if (input.recoveryKind === 'historical' && input.processId !== null) {
      throw createExpectedAppError(
        'TERMINAL_SESSION_RETENTION_NOT_ALLOWED',
        'Historical terminal recovery cannot claim a live process.'
      )
    }

    const session = new TerminalSession(
      input.scope,
      input.workingDirectory,
      input.kind,
      input.terminalSourceTheme ?? 'dark'
    )
    session.processIdValue = input.processId
    session.statusValue = input.recoveryKind === 'warm' ? 'running' : 'exited'
    session.retentionPolicyValue = input.retentionPolicy
    session.recoveryKindValue = input.recoveryKind
    session.recordedInput.push(...(input.inputHistory ?? []))
    session.exitCodeValue = input.exitCode ?? null
    session.failureReasonValue = input.failureReason ?? null
    return session
  }

  get id(): string {
    return this.scope.sessionId
  }

  get terminalBlockId(): string {
    return this.scope.blockId
  }

  get workspaceId(): string {
    return this.scope.workspaceId
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

  get retentionPolicy(): TerminalRetentionPolicy {
    return this.retentionPolicyValue
  }

  get recoveryKind(): TerminalRecoveryKind {
    return this.recoveryKindValue
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

  setRetentionPolicy(policy: TerminalRetentionPolicy): void {
    if (this.statusValue !== 'running') {
      throw createExpectedAppError(
        'TERMINAL_SESSION_NOT_RUNNING',
        'Terminal session is not running.'
      )
    }

    assertRetentionAllowed(this.scope, this.kind, policy)
    this.retentionPolicyValue = policy
  }

  markStopping(): void {
    if (this.statusValue === 'running') {
      this.statusValue = 'stopping'
    }
  }

  markExited(input: { readonly exitCode: number | null }): void {
    this.statusValue = 'exited'
    this.exitCodeValue = input.exitCode
    if (this.recoveryKindValue !== 'historical') {
      this.recoveryKindValue = 'ended'
    }
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
      workspaceId: this.workspaceId,
      workingDirectory: this.workingDirectory,
      processId: this.processIdValue,
      status: this.statusValue,
      kind: this.kind,
      retentionPolicy: this.retentionPolicyValue,
      recoveryKind: this.recoveryKindValue,
      terminalSourceTheme: this.terminalSourceTheme,
      inputHistory: this.recordedInput,
      exitCode: this.exitCodeValue,
      failureReason: this.failureReasonValue
    }
  }
}

function assertRetentionAllowed(
  scope: TerminalRunScope,
  kind: TerminalSessionKind,
  policy: TerminalRetentionPolicy
): void {
  if (policy !== 'keep-after-application-exit') return
  if (kind === 'workflow') {
    throw createExpectedAppError(
      'TERMINAL_SESSION_RETENTION_NOT_ALLOWED',
      'Workflow terminal sessions cannot survive application exit.'
    )
  }
  if (resolveTerminalOwnerRef(scope).kind === 'agent') {
    throw createExpectedAppError(
      'TERMINAL_SESSION_RETENTION_NOT_ALLOWED',
      'Agent terminal sessions cannot survive application exit.'
    )
  }
}
