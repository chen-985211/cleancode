import type { TerminalOutputEvent } from '../../contexts/run/application/ports/TerminalProcessPort'
import type { TerminalRunScope } from '../../contexts/run/domain/value-objects/TerminalRunScope'
import { appendTerminalOutputTail } from './terminalOutputTail'
import type { TerminalViewState } from './types'

export interface TerminalInputBuffer {
  readonly sessionId: string
  readonly input: string
  readonly timerId: number | null
}

export function appendTerminalOutput(
  states: Record<string, TerminalViewState>,
  event: TerminalOutputEvent
): Record<string, TerminalViewState> {
  let nextStates: Record<string, TerminalViewState> | null = null

  for (const [blockId, state] of Object.entries(states)) {
    if (
      state.sessionId !== event.sessionId ||
      state.runIdentity?.runId !== event.scope.runId ||
      state.runIdentity.generation !== event.scope.generation
    ) {
      continue
    }
    nextStates ??= { ...states }
    nextStates[blockId] = {
      ...state,
      output: appendTerminalOutputTail(state.output, event.data)
    }
  }

  return nextStates ?? states
}

export function bufferTerminalStartupOutput(
  outputs: Map<string, string>,
  event: TerminalOutputEvent
): void {
  outputs.set(
    event.sessionId,
    appendTerminalOutputTail(outputs.get(event.sessionId) ?? '', event.data)
  )
}

export function takeTerminalStartupOutput(
  outputs: Map<string, string>,
  scope: TerminalRunScope
): string {
  const output = outputs.get(scope.sessionId) ?? ''

  outputs.delete(scope.sessionId)
  return output
}
