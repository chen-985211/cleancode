import type { TerminalSessionStatus } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalExitEvent } from '../../contexts/run/application/ports/TerminalProcessPort'
import type { TerminalViewState } from './types'

export function updateTerminalBlockStatus(
  states: Record<string, TerminalViewState>,
  blockId: string,
  status: TerminalSessionStatus
): Record<string, TerminalViewState> {
  const currentState = states[blockId]

  return currentState ? { ...states, [blockId]: { ...currentState, status } } : states
}

export function updateTerminalStatus(
  states: Record<string, TerminalViewState>,
  event: TerminalExitEvent,
  status: TerminalSessionStatus
): Record<string, TerminalViewState> {
  return Object.fromEntries(
    Object.entries(states).map(([blockId, state]) => [
      blockId,
      state.sessionId === event.sessionId &&
      state.runIdentity?.runId === event.scope.runId &&
      state.runIdentity.generation === event.scope.generation
        ? { ...state, status }
        : state
    ])
  )
}
