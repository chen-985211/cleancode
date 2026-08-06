import type { Socket } from 'node:net'

import type { TerminalSessionSnapshot } from '../../application/dto/TerminalSessionSnapshot'
import type { TerminalScrollbackRows } from '../../application/dto/TerminalRuntimeSettings'
import type {
  LaunchForegroundJobProcessCommand,
  StartTerminalProcessCommand
} from '../../application/ports/TerminalProcessPort'
import type { TerminalRetentionPolicy } from '../../domain/aggregates/TerminalSession'
import type { ActualServiceEndpoint } from '../../domain/value-objects/ActualServiceEndpoint'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'
import type { TerminalProviderSessionPersistence } from './TerminalProviderSessionPersistence'
import type { TerminalProviderApplicationDetachResult } from './TerminalProviderProtocol'

export interface ProviderTerminalSession {
  snapshot: TerminalSessionSnapshot
  persistence: TerminalProviderSessionPersistence
  managedServiceEndpoint: ActualServiceEndpoint | undefined
  quarantined: boolean
  retired: boolean
  starting: boolean
}

export type ProviderControllerReleaseReason = 'application-detach' | 'unexpected-disconnect'

export interface ProviderControllerRelease {
  readonly socket: Socket
  readonly controllerId: string
  readonly controllerLeaseId: string
  readonly processId: number
  readonly reason: ProviderControllerReleaseReason
  readonly releaseId: string
  readonly release: Promise<TerminalProviderApplicationDetachResult>
}

export type ProviderControllerState =
  | { readonly kind: 'unclaimed' }
  | {
      readonly kind: 'active'
      readonly socket: Socket
      readonly controllerId: string
      readonly controllerLeaseId: string
      readonly processId: number
    }
  | ({ readonly kind: 'releasing' } & ProviderControllerRelease)

export interface TerminalProviderRequestParams {
  readonly command: Omit<StartTerminalProcessCommand, 'onOutput' | 'onExit'> & {
    readonly identity: TerminalRunScope
  }
  readonly foregroundJob: Omit<LaunchForegroundJobProcessCommand, 'onExit' | 'onStarted'>
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
  readonly releaseId: string
}

export function countLiveProviderSessions(sessions: Iterable<ProviderTerminalSession>): number {
  return [...sessions].filter(({ snapshot, starting }) => snapshot.status === 'running' || starting)
    .length
}

export function hasLiveProviderSessions(sessions: Iterable<ProviderTerminalSession>): boolean {
  return [...sessions].some(({ snapshot, starting }) => snapshot.status === 'running' || starting)
}
