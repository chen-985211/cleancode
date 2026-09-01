import type {
  TerminalRunIdentity,
  TerminalServiceEndpoint
} from '../../application/dto/TerminalRunEvent'
import type { TerminalSessionSnapshot } from '../../application/dto/TerminalSessionSnapshot'
import type { TerminalExitEvent } from '../../application/ports/TerminalProcessPort'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'
import { createIdleTerminalState, type TerminalViewState } from './TerminalPresentationTypes'
import { createTerminalStateKey } from './terminalSessionWorkspaceMigration'

export interface StartTerminalRuntimeCommand {
  readonly projectId: string
  readonly projectDirectory: string
  readonly terminalBlockId: string
  readonly workspaceId: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly columns: number
  readonly rows: number
  readonly terminalSourceTheme: TerminalSourceTheme
}

export type LaunchTerminalRuntimeCommand = StartTerminalRuntimeCommand

export interface LaunchTerminalRuntimeResult {
  readonly session: TerminalSessionSnapshot
  readonly endpoint: TerminalServiceEndpoint | null
}

export function beginTerminalAutoStart(
  states: Record<string, TerminalViewState>,
  terminalStateKey: string,
  runtimeEpoch: number
): Record<string, TerminalViewState> {
  const current = states[terminalStateKey] ?? createIdleTerminalState()
  return {
    ...states,
    [terminalStateKey]: {
      ...current,
      autoStartRuntimeEpoch: runtimeEpoch,
      autoStartStatus: 'pending'
    }
  }
}

export function failTerminalAutoStart(
  states: Record<string, TerminalViewState>,
  terminalStateKey: string,
  runtimeEpoch: number
): Record<string, TerminalViewState> {
  const current = states[terminalStateKey]
  if (
    !current ||
    current.sessionId ||
    current.autoStartRuntimeEpoch !== runtimeEpoch ||
    current.autoStartStatus !== 'pending'
  ) {
    return states
  }
  return {
    ...states,
    [terminalStateKey]: { ...current, autoStartStatus: 'failed' }
  }
}

export function projectTerminalAutoStartStatus(
  state: TerminalViewState,
  runtimeEpoch: number
): TerminalViewState {
  const autoStartStatus = state.sessionId
    ? 'succeeded'
    : state.isRecoveryPending || state.autoStartRuntimeEpoch !== runtimeEpoch
      ? 'idle'
      : (state.autoStartStatus ?? 'idle')
  return state.autoStartStatus === autoStartStatus ? state : { ...state, autoStartStatus }
}

export async function startTerminalRuntimeSession(
  command: StartTerminalRuntimeCommand
): Promise<TerminalSessionSnapshot | undefined> {
  const api = window.cleancode as TerminalSessionRuntimeApi | undefined
  return api?.startTerminal(command)
}

export async function launchTerminalRuntimeSession(
  command: LaunchTerminalRuntimeCommand
): Promise<LaunchTerminalRuntimeResult | undefined> {
  const api = window.cleancode as TerminalSessionRuntimeApi | undefined
  return api?.launchTerminal?.(command)
}

function toTerminalRunIdentity(
  session: Pick<
    TerminalSessionSnapshot,
    'projectId' | 'workspaceId' | 'blockId' | 'sessionId' | 'runId' | 'generation'
  >
): TerminalRunIdentity {
  return {
    projectId: session.projectId,
    workspaceId: session.workspaceId,
    blockId: session.blockId,
    sessionId: session.sessionId,
    runId: session.runId,
    generation: session.generation
  }
}

function toTerminalViewState(
  session: TerminalSessionSnapshot,
  output: string,
  actualEndpoint: TerminalServiceEndpoint | null = null
): TerminalViewState {
  return {
    sessionId: session.id,
    status: session.status,
    output,
    autoStartStatus: 'succeeded',
    sessionKind: session.kind,
    retentionPolicy: session.retentionPolicy,
    recoveryKind: session.recoveryKind,
    terminalSourceTheme: session.terminalSourceTheme,
    isRecoveryPending: false,
    runIdentity: toTerminalRunIdentity(session),
    actualEndpoint,
    portConflict: null,
    servicePortState: actualEndpoint ? 'bound' : null
  }
}

export function applyTerminalSessionSnapshot(
  states: Record<string, TerminalViewState>,
  terminalStateKey: string,
  session: TerminalSessionSnapshot,
  output: string,
  actualEndpoint: TerminalServiceEndpoint | null
): Record<string, TerminalViewState> {
  return applySessionSnapshot(states, terminalStateKey, session, output, actualEndpoint, false)
}

export function applyRecoveredTerminalSessionSnapshot(
  states: Record<string, TerminalViewState>,
  terminalStateKey: string,
  session: TerminalSessionSnapshot,
  output: string,
  actualEndpoint: TerminalServiceEndpoint | null
): Record<string, TerminalViewState> {
  return applySessionSnapshot(states, terminalStateKey, session, output, actualEndpoint, true)
}

function applySessionSnapshot(
  states: Record<string, TerminalViewState>,
  terminalStateKey: string,
  session: TerminalSessionSnapshot,
  output: string,
  actualEndpoint: TerminalServiceEndpoint | null,
  isAuthoritativeRecovery: boolean
): Record<string, TerminalViewState> {
  const currentIdentity = states[terminalStateKey]?.runIdentity
  const nextIdentity = toTerminalRunIdentity(session)
  if (
    currentIdentity &&
    (currentIdentity.generation > nextIdentity.generation ||
      (currentIdentity.generation === nextIdentity.generation &&
        (currentIdentity.runId !== nextIdentity.runId ||
          currentIdentity.sessionId !== nextIdentity.sessionId)))
  ) {
    return states
  }

  const currentState = states[terminalStateKey]
  const isSameIdentity =
    currentState?.runIdentity && isSameRunIdentity(currentState.runIdentity, nextIdentity)
  const nextState = toTerminalViewState(
    session,
    isSameIdentity && output.length === 0 ? currentState.output : output,
    actualEndpoint
  )
  const acceptedState =
    !isAuthoritativeRecovery &&
    isSameIdentity &&
    isTerminalStatus(currentState.status) &&
    !isTerminalStatus(session.status)
      ? {
          ...nextState,
          status: currentState.status,
          actualEndpoint: currentState.actualEndpoint,
          portConflict: currentState.portConflict,
          servicePortState: currentState.servicePortState
        }
      : nextState

  return {
    ...states,
    [terminalStateKey]: acceptedState
  }
}

export function applyTerminalExitEvent(
  states: Record<string, TerminalViewState>,
  event: TerminalExitEvent
): Record<string, TerminalViewState> {
  const terminalStateKey = createTerminalStateKey(
    event.scope.projectId,
    event.scope.workspaceId,
    event.scope.blockId
  )
  const identity = toTerminalRunIdentity(event.scope)
  const current = states[terminalStateKey]

  if (current?.runIdentity && !canReplaceIdentity(current.runIdentity, identity)) return states
  if (current?.runIdentity && isSameRunIdentity(current.runIdentity, identity)) {
    if (current.status === 'exited') return states
    return { ...states, [terminalStateKey]: { ...current, status: 'exited' } }
  }

  return {
    ...states,
    [terminalStateKey]: {
      sessionId: event.sessionId,
      status: 'exited',
      output: '',
      autoStartStatus: 'succeeded',
      sessionKind: null,
      retentionPolicy: 'terminate-on-application-exit',
      recoveryKind: 'ended',
      runIdentity: identity,
      actualEndpoint: null,
      portConflict: null,
      servicePortState: null
    }
  }
}

export function applyTerminalSessionStatusSnapshot(
  states: Record<string, TerminalViewState>,
  terminalStateKey: string,
  session: TerminalSessionSnapshot
): Record<string, TerminalViewState> {
  const current = states[terminalStateKey]
  const identity = toTerminalRunIdentity(session)
  if (!current?.runIdentity || !isSameRunIdentity(current.runIdentity, identity)) return states
  if (
    current.status === session.status &&
    current.retentionPolicy === session.retentionPolicy &&
    current.recoveryKind === session.recoveryKind &&
    current.sessionKind === session.kind
  ) {
    return states
  }
  return {
    ...states,
    [terminalStateKey]: {
      ...current,
      status: session.status,
      sessionKind: session.kind,
      retentionPolicy: session.retentionPolicy,
      recoveryKind: session.recoveryKind
    }
  }
}

export function reconcileTerminalSessionSnapshots(
  states: Record<string, TerminalViewState>,
  requestedRuns: readonly TerminalRunIdentity[],
  sessions: readonly TerminalSessionSnapshot[]
): Record<string, TerminalViewState> {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]))
  let nextStates = states

  for (const requested of requestedRuns) {
    const terminalStateKey = createTerminalStateKey(
      requested.projectId,
      requested.workspaceId,
      requested.blockId
    )
    const current = nextStates[terminalStateKey]
    if (!current?.runIdentity || !isSameRunIdentity(current.runIdentity, requested)) continue
    const session = sessionsById.get(requested.sessionId)
    const status =
      session && isSameRunIdentity(toTerminalRunIdentity(session), requested)
        ? session.status
        : 'exited'
    if (current.status !== status) {
      nextStates = { ...nextStates, [terminalStateKey]: { ...current, status } }
    }
  }

  return nextStates
}

export function reconcileStaleTerminalViewSnapshot(
  states: Record<string, TerminalViewState>,
  requested: TerminalRunIdentity,
  sessions: readonly TerminalSessionSnapshot[]
): Record<string, TerminalViewState> {
  const terminalStateKey = createTerminalStateKey(
    requested.projectId,
    requested.workspaceId,
    requested.blockId
  )
  const current = states[terminalStateKey]
  if (!current?.runIdentity || !isSameRunIdentity(current.runIdentity, requested)) return states

  const session = sessions.find((candidate) => candidate.id === requested.sessionId)
  if (!session) return reconcileTerminalSessionSnapshots(states, [requested], sessions)

  const refreshedIdentity = toTerminalRunIdentity(session)
  if (
    !isSameRunOwnerScope(refreshedIdentity, requested) ||
    refreshedIdentity.generation <= requested.generation
  ) {
    return states
  }

  return applyTerminalSessionSnapshot(
    states,
    terminalStateKey,
    session,
    current.output,
    current.actualEndpoint ?? null
  )
}

function isSameRunIdentity(left: TerminalRunIdentity, right: TerminalRunIdentity): boolean {
  return (
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.blockId === right.blockId &&
    left.sessionId === right.sessionId &&
    left.runId === right.runId &&
    left.generation === right.generation
  )
}

function isSameRunOwnerScope(left: TerminalRunIdentity, right: TerminalRunIdentity): boolean {
  return (
    left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId &&
    left.blockId === right.blockId &&
    left.sessionId === right.sessionId
  )
}

function canReplaceIdentity(current: TerminalRunIdentity, incoming: TerminalRunIdentity): boolean {
  return (
    incoming.generation > current.generation ||
    (incoming.generation === current.generation && isSameRunIdentity(current, incoming))
  )
}

function isTerminalStatus(status: TerminalViewState['status']): boolean {
  return status === 'exited' || status === 'failed'
}

interface TerminalSessionRuntimeApi {
  readonly startTerminal: (
    command: StartTerminalRuntimeCommand
  ) => Promise<TerminalSessionSnapshot | undefined>
  readonly launchTerminal?: (
    command: LaunchTerminalRuntimeCommand
  ) => Promise<LaunchTerminalRuntimeResult | undefined>
}
