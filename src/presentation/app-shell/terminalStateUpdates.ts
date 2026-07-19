import type { TerminalSessionStatus } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalViewState } from './types'

export function updateTerminalBlockStatus(
  states: Record<string, TerminalViewState>,
  blockId: string,
  status: TerminalSessionStatus
): Record<string, TerminalViewState> {
  const currentState = states[blockId]

  return currentState ? { ...states, [blockId]: { ...currentState, status } } : states
}
