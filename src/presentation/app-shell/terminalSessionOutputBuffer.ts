import type { TerminalOutputEvent } from '../../contexts/run/application/ports/TerminalProcessPort'
import { appendTerminalOutputTail } from './terminalOutputTail'
import { terminalOutputBrowserEventName, type TerminalViewState } from './types'

export interface TerminalInputBuffer {
  readonly sessionId: string
  readonly input: string
  readonly timerId: number | null
}

export function appendTerminalOutput(
  states: Record<string, TerminalViewState>,
  event: TerminalOutputEvent
): Record<string, TerminalViewState> {
  return Object.fromEntries(
    Object.entries(states).map(([blockId, state]) => [
      blockId,
      state.sessionId === event.sessionId
        ? { ...state, output: appendTerminalOutputTail(state.output, event.data) }
        : state
    ])
  )
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

export function takeTerminalStartupOutput(outputs: Map<string, string>, sessionId: string): string {
  const output = outputs.get(sessionId) ?? ''

  outputs.delete(sessionId)
  if (output) {
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent<TerminalOutputEvent>(terminalOutputBrowserEventName, {
          detail: { sessionId, data: output }
        })
      )
    }, 0)
  }

  return output
}
