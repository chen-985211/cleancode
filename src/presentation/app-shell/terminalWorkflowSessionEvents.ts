import type { TerminalWorkflowEvent } from '../../contexts/run/application/ports/TerminalWorkflowEventPublisherPort'
import { appendTerminalOutputTail } from './terminalOutputTail'
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
    const key = createTerminalStateKey(event.session.workspaceName, event.blockId)

    return {
      ...states,
      [key]: {
        sessionId: event.session.id,
        status: event.session.status,
        output: event.clearOutput ? '' : (states[key]?.output ?? '')
      }
    }
  }

  return Object.fromEntries(
    Object.entries(states).map(([key, state]) => [
      key,
      state.sessionId === event.output.sessionId
        ? { ...state, output: appendTerminalOutputTail(state.output, event.output.data) }
        : state
    ])
  )
}
