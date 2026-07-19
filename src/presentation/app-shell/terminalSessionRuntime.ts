import type { TerminalSessionSnapshot } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalExitEvent } from '../../contexts/run/application/ports/TerminalProcessPort'
import { createTerminalStateKey } from './terminalSessionWorkspaceMigration'
import type { TerminalRunIdentity, TerminalServiceEndpoint, TerminalViewState } from './types'

export interface StartTerminalRuntimeCommand {
  readonly projectId: string
  readonly projectDirectory: string
  readonly terminalBlockId: string
  readonly workspaceName: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly columns: number
  readonly rows: number
}

export type LaunchTerminalRuntimeCommand = StartTerminalRuntimeCommand

export interface LaunchTerminalRuntimeResult {
  readonly session: TerminalSessionSnapshot
  readonly endpoint: TerminalServiceEndpoint | null
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
    'projectId' | 'workspaceName' | 'blockId' | 'sessionId' | 'runId' | 'generation'
  >
): TerminalRunIdentity {
  return {
    projectId: session.projectId,
    workspaceName: session.workspaceName,
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

  const nextState = toTerminalViewState(session, output, actualEndpoint)
  const currentState = states[terminalStateKey]
  const acceptedState =
    currentState?.runIdentity &&
    isSameRunIdentity(currentState.runIdentity, nextIdentity) &&
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
    event.scope.workspaceName,
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
  if (current.status === session.status) return states
  return { ...states, [terminalStateKey]: { ...current, status: session.status } }
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
      requested.workspaceName,
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

function isSameRunIdentity(left: TerminalRunIdentity, right: TerminalRunIdentity): boolean {
  return (
    left.projectId === right.projectId &&
    left.workspaceName === right.workspaceName &&
    left.blockId === right.blockId &&
    left.sessionId === right.sessionId &&
    left.runId === right.runId &&
    left.generation === right.generation
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
