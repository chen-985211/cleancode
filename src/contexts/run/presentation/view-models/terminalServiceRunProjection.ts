import type { TerminalRunEvent, TerminalRunIdentity } from '../../application/dto/TerminalRunEvent'
import { createIdleTerminalState, type TerminalViewState } from './TerminalPresentationTypes'
import { createTerminalStateKey } from './terminalSessionWorkspaceMigration'

export type TerminalServiceRunEvent = TerminalRunEvent

export function applyTerminalServiceRunEvent(
  states: Record<string, TerminalViewState>,
  event: TerminalServiceRunEvent
): Record<string, TerminalViewState> {
  const key = createTerminalStateKey(
    event.scope.projectId,
    event.scope.workspaceId,
    event.scope.blockId
  )
  const existing = states[key]
  if (!existing && event.type !== 'service-run-started' && event.type !== 'service-port-conflict') {
    return states
  }
  const current = existing ?? createIdleTerminalState()

  if (event.type === 'service-run-started') {
    if (current.runIdentity && current.runIdentity.generation >= event.scope.generation) {
      return states
    }

    return {
      ...states,
      [key]: {
        ...current,
        sessionId: event.scope.sessionId,
        status: 'running',
        runIdentity: event.scope,
        actualEndpoint: null,
        portConflict: null,
        servicePortState: null
      }
    }
  }

  if (event.type === 'service-port-conflict') {
    if (
      current.runIdentity &&
      (current.runIdentity.generation > event.scope.generation ||
        (current.runIdentity.generation === event.scope.generation &&
          !isSameRun(current.runIdentity, event.scope)))
    ) {
      return states
    }

    return {
      ...states,
      [key]: {
        ...current,
        sessionId: event.scope.sessionId,
        status: 'failed',
        runIdentity: event.scope,
        actualEndpoint: null,
        portConflict: event.conflict,
        servicePortState: null
      }
    }
  }

  if (!isSameRun(current.runIdentity, event.scope)) return states

  if (event.type === 'service-endpoint-updated') {
    return {
      ...states,
      [key]: {
        ...current,
        actualEndpoint: event.endpoint,
        portConflict: null,
        servicePortState: event.endpoint ? 'bound' : null
      }
    }
  }

  if (event.type === 'service-port-state-changed') {
    return {
      ...states,
      [key]: {
        ...current,
        actualEndpoint: event.state === 'released' ? null : current.actualEndpoint,
        servicePortState: event.state === 'released' ? null : event.state
      }
    }
  }

  return {
    ...states,
    [key]: {
      ...current,
      actualEndpoint: null,
      portConflict: null,
      servicePortState: null
    }
  }
}

export function dismissTerminalPortConflict(
  states: Record<string, TerminalViewState>,
  identity: TerminalRunIdentity
): Record<string, TerminalViewState> {
  const key = createTerminalStateKey(identity.projectId, identity.workspaceId, identity.blockId)
  const current = states[key]

  if (!current || !isSameRun(current.runIdentity, identity) || !current.portConflict) {
    return states
  }

  return { ...states, [key]: { ...current, portConflict: null } }
}

function isSameRun(
  current: TerminalRunIdentity | null | undefined,
  event: TerminalRunIdentity
): boolean {
  return Boolean(
    current &&
    current.runId === event.runId &&
    current.sessionId === event.sessionId &&
    current.generation === event.generation
  )
}
