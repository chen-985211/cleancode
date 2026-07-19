import type { TerminalWorkflowEvent } from '../../contexts/run/application/ports/TerminalWorkflowEventPublisherPort'
import { appendTerminalOutputTail } from './terminalOutputTail'
import { applyTerminalServiceRunEvent } from './terminalServiceRunProjection'
import { createTerminalStateKey } from './terminalSessionWorkspaceMigration'
import type { TerminalViewState } from './types'

export function applyTerminalWorkflowEventToStates(
  states: Record<string, TerminalViewState>,
  event: TerminalWorkflowEvent
): Record<string, TerminalViewState> {
  if (event.type === 'run-updated') {
    return states
  }

  if (event.type === 'terminal-session-started') {
    const key = createTerminalStateKey(
      event.session.projectId,
      event.session.workspaceName,
      event.blockId
    )
    const current = states[key]

    if (current?.runIdentity && current.runIdentity.generation >= event.session.generation) {
      return states
    }

    return {
      ...states,
      [key]: {
        sessionId: event.session.id,
        status: event.session.status,
        output: event.clearOutput ? '' : (states[key]?.output ?? ''),
        runIdentity: {
          projectId: event.session.projectId,
          workspaceName: event.session.workspaceName,
          blockId: event.session.blockId,
          sessionId: event.session.sessionId,
          runId: event.session.runId,
          generation: event.session.generation
        },
        actualEndpoint: event.endpoint,
        portConflict: null,
        servicePortState: event.endpoint ? 'bound' : null
      }
    }
  }

  if (event.type === 'service-endpoint-updated' || event.type === 'service-port-state-changed') {
    return applyTerminalServiceRunEvent(states, event)
  }

  if (event.type === 'service-port-conflict') {
    return states
  }

  return Object.fromEntries(
    Object.entries(states).map(([key, state]) => [
      key,
      state.sessionId === event.output.sessionId &&
      state.runIdentity?.runId === event.output.scope.runId &&
      state.runIdentity.generation === event.output.scope.generation
        ? { ...state, output: appendTerminalOutputTail(state.output, event.output.data) }
        : state
    ])
  )
}
