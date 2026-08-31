import type {
  TerminalRunIdentity,
  TerminalServiceEndpoint,
  TerminalServicePortConflict
} from '../../application/dto/TerminalRunEvent'
import type {
  TerminalRecoveryKind,
  TerminalRetentionPolicy,
  TerminalSessionKind,
  TerminalSessionStatus
} from '../../application/dto/TerminalSessionSnapshot'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'

export interface TerminalDimensions {
  readonly columns: number
  readonly rows: number
}

export interface TerminalViewState {
  readonly sessionId: string | null
  readonly status: TerminalSessionStatus
  readonly output: string
  readonly autoStartStatus?: 'failed' | 'idle' | 'pending' | 'succeeded'
  readonly autoStartRuntimeEpoch?: number
  readonly sessionKind?: TerminalSessionKind | null
  readonly retentionPolicy?: TerminalRetentionPolicy
  readonly recoveryKind?: TerminalRecoveryKind
  readonly terminalSourceTheme?: TerminalSourceTheme
  readonly isRecoveryPending?: boolean
  readonly runIdentity?: TerminalRunIdentity | null
  readonly actualEndpoint?: TerminalServiceEndpoint | null
  readonly portConflict?: TerminalServicePortConflict | null
  readonly servicePortState?: 'bound' | 'releasing' | 'quarantined' | null
}

export interface TerminalStateStore {
  readonly getDiagnostics: () => {
    readonly listenerCount: number
    readonly stateCount: number
  }
  readonly getState: (terminalId: string) => TerminalViewState
  readonly replaceStates: (states: Readonly<Record<string, TerminalViewState>>) => void
  readonly subscribe: (terminalId: string, listener: () => void) => () => void
}

export function createIdleTerminalState(): TerminalViewState {
  return {
    sessionId: null,
    status: 'idle',
    output: '',
    autoStartStatus: 'idle',
    sessionKind: null,
    retentionPolicy: 'terminate-on-application-exit',
    recoveryKind: 'fresh',
    runIdentity: null,
    actualEndpoint: null,
    portConflict: null,
    servicePortState: null
  }
}
