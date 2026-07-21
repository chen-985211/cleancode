import type { Socket } from 'node:net'

import type { TerminalSessionSnapshot } from '../../application/dto/TerminalSessionSnapshot'
import type { TerminalScrollbackRows } from '../../application/dto/TerminalRuntimeSettings'
import type { StartTerminalProcessCommand } from '../../application/ports/TerminalProcessPort'
import type { TerminalRetentionPolicy } from '../../domain/aggregates/TerminalSession'
import type { ActualServiceEndpoint } from '../../domain/value-objects/ActualServiceEndpoint'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'

export interface ProviderTerminalSession {
  snapshot: TerminalSessionSnapshot
  checkpointTimer: ReturnType<typeof setTimeout> | null
  persistenceTail: Promise<void>
  managedServiceEndpoint: ActualServiceEndpoint | undefined
  retired: boolean
}

export type ProviderControllerReleaseReason = 'application-detach' | 'unexpected-disconnect'

export type ProviderControllerState =
  | { readonly kind: 'unclaimed' }
  | {
      readonly kind: 'active'
      readonly socket: Socket
      readonly controllerId: string
      readonly controllerLeaseId: string
      readonly processId: number
    }
  | { readonly kind: 'releasing'; readonly release: Promise<void> }

export interface TerminalProviderRequestParams {
  readonly command: Omit<StartTerminalProcessCommand, 'onOutput' | 'onExit'> & {
    readonly identity: TerminalRunScope
  }
  readonly sessionId: string
  readonly input: string
  readonly columns: number
  readonly rows: TerminalScrollbackRows
  readonly identity: TerminalRunScope
  readonly viewId: string
  readonly workingDirectory: string
  readonly retentionPolicy: TerminalRetentionPolicy
  readonly endpoint: ActualServiceEndpoint
  readonly controllerId: string
  readonly processId: number
}

export function countLiveProviderSessions(sessions: Iterable<ProviderTerminalSession>): number {
  return [...sessions].filter(({ snapshot }) => snapshot.status === 'running').length
}

export function hasRetainedLiveProviderSessions(
  sessions: Iterable<ProviderTerminalSession>
): boolean {
  return [...sessions].some(
    ({ snapshot }) =>
      snapshot.status === 'running' && snapshot.retentionPolicy === 'keep-after-application-exit'
  )
}
