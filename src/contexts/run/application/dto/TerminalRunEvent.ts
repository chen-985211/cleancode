import type { ActualServiceEndpoint } from '../../domain/value-objects/ActualServiceEndpoint'
import type { ServicePortLeaseState } from '../../domain/services/ServicePortLeaseRegistry'

export interface TerminalRunIdentity {
  readonly projectId: string
  readonly workspaceName: string
  readonly blockId: string
  readonly sessionId: string
  readonly runId: string
  readonly generation: number
}

export type TerminalServiceEndpoint = ActualServiceEndpoint

export interface ManagedTerminalServiceOwner {
  readonly identity: TerminalRunIdentity
  readonly projectName: string
  readonly workspaceName: string
  readonly terminalName: string
}

export interface TerminalServicePortConflict {
  readonly code:
    | 'SERVICE_PORT_FIXED_CONFLICT'
    | 'SERVICE_PORT_ALLOCATION_EXHAUSTED'
    | 'SERVICE_LISTENER_OWNERSHIP_MISMATCH'
    | 'SERVICE_LISTENER_OWNERSHIP_UNVERIFIED'
  readonly port: number
  readonly ownership: 'managed' | 'external' | 'unknown'
  readonly managedOwner: ManagedTerminalServiceOwner | null
  readonly managedLeaseState: ServicePortLeaseState | null
}

export type TerminalRunEvent =
  | { readonly type: 'service-run-started'; readonly scope: TerminalRunIdentity }
  | {
      readonly type: 'service-endpoint-updated'
      readonly scope: TerminalRunIdentity
      readonly endpoint: TerminalServiceEndpoint | null
    }
  | {
      readonly type: 'service-port-conflict'
      readonly scope: TerminalRunIdentity
      readonly conflict: TerminalServicePortConflict
    }
  | {
      readonly type: 'service-port-state-changed'
      readonly scope: TerminalRunIdentity
      readonly state: 'releasing' | 'released' | 'quarantined'
    }
  | { readonly type: 'service-run-ended'; readonly scope: TerminalRunIdentity }
