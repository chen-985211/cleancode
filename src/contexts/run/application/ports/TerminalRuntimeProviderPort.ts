import type { TerminalSessionSnapshot } from '../dto/TerminalSessionSnapshot'
import type { TerminalExitEvent, TerminalProcessOutputEvent } from './TerminalProcessPort'
import type { TerminalRetentionPolicy } from '../../domain/aggregates/TerminalSession'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'
import type { ActualServiceEndpoint } from '../../domain/value-objects/ActualServiceEndpoint'

export interface RecoveredManagedServiceEndpoint {
  readonly scope: TerminalRunScope
  readonly endpoint: ActualServiceEndpoint
  readonly rootProcessId: number
}

export interface TerminalRuntimeRecoveryIssue {
  readonly storageKey?: string
  readonly sessionId?: string | null
  readonly reason: string
}

export interface TerminalRuntimeRecoveryResult {
  readonly sessions: readonly TerminalSessionSnapshot[]
  readonly issues: readonly TerminalRuntimeRecoveryIssue[]
  readonly managedServiceEndpoints: readonly RecoveredManagedServiceEndpoint[]
}

export interface TerminalRuntimeProviderPort {
  initialize(): Promise<TerminalRuntimeRecoveryResult>
  bindRecoveryIssueHandler?(handler: (issue: TerminalRuntimeRecoveryIssue) => void): void
  bindRecoveredSession(
    identity: TerminalRunScope,
    callbacks: {
      readonly onOutput: (event: TerminalProcessOutputEvent) => void
      readonly onExit: (event: TerminalExitEvent) => void
    }
  ): void
  setRetentionPolicy(sessionId: string, retentionPolicy: TerminalRetentionPolicy): Promise<void>
  recordManagedServiceEndpoint(sessionId: string, endpoint: ActualServiceEndpoint): Promise<void>
  retireSession(identity: TerminalRunScope): Promise<void>
  detachApplication(): Promise<void>
}
