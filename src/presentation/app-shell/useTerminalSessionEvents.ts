import { useEffect, type SetStateAction } from 'react'

import type { TerminalOutputEvent } from '../../contexts/run/application/ports/TerminalProcessPort'
import { appendTerminalOutput, bufferTerminalStartupOutput } from './terminalSessionOutputBuffer'
import { findTerminalStateKeyBySession } from './terminalSessionStateSelectors'
import { createTerminalStateKey } from './terminalSessionWorkspaceMigration'
import {
  applyTerminalServiceRunEvent,
  type TerminalServiceRunEvent
} from './terminalServiceRunProjection'
import { updateTerminalStatus } from './terminalStateUpdates'
import { applyTerminalWorkflowEventToStates } from './terminalWorkflowSessionEvents'
import { terminalOutputBrowserEventName, type TerminalViewState } from './types'

interface UseTerminalSessionEventsInput {
  readonly clearPendingTerminalInput: (terminalStateKey: string) => void
  readonly terminalStartupOutputsRef: { readonly current: Map<string, string> }
  readonly terminalStatesRef: { readonly current: Record<string, TerminalViewState> }
  readonly updateTerminalStates: (
    stateAction: SetStateAction<Record<string, TerminalViewState>>
  ) => void
}

export function useTerminalSessionEvents({
  clearPendingTerminalInput,
  terminalStartupOutputsRef,
  terminalStatesRef,
  updateTerminalStates
}: UseTerminalSessionEventsInput): void {
  useEffect(() => {
    const api = window.cleancode

    if (!api) return undefined

    const unsubscribeOutput = api.onTerminalOutput((event) => {
      if (!findTerminalStateKeyBySession(terminalStatesRef.current, event.sessionId)) {
        bufferTerminalStartupOutput(terminalStartupOutputsRef.current, event)
      }
      updateTerminalStates((states) => appendTerminalOutput(states, event))
      publishTerminalOutput(event)
    })
    const unsubscribeExit = api.onTerminalExit((event) => {
      const exitedTerminalStateKey = findTerminalStateKeyBySession(
        terminalStatesRef.current,
        event.sessionId
      )

      if (exitedTerminalStateKey) clearPendingTerminalInput(exitedTerminalStateKey)
      updateTerminalStates((states) => updateTerminalStatus(states, event, 'exited'))
    })

    return () => {
      unsubscribeOutput()
      unsubscribeExit()
    }
  }, [
    clearPendingTerminalInput,
    terminalStartupOutputsRef,
    terminalStatesRef,
    updateTerminalStates
  ])

  useEffect(() => {
    const api = window.cleancode as TerminalRunEventRuntimeApi | undefined

    if (typeof api?.onTerminalRunEvent !== 'function') return undefined

    return api.onTerminalRunEvent((event) => {
      updateTerminalStates((states) => applyTerminalServiceRunEvent(states, event))
    })
  }, [updateTerminalStates])

  useEffect(() => {
    const api = window.cleancode

    if (!api || typeof api.onTerminalWorkflowEvent !== 'function') return undefined

    return api.onTerminalWorkflowEvent((event) => {
      if (event.type === 'terminal-output') publishTerminalOutput(event.output)

      let acceptedSessionKey: string | null = null
      updateTerminalStates((states) => {
        const nextStates = applyTerminalWorkflowEventToStates(states, event)

        if (event.type === 'terminal-session-started' && nextStates !== states) {
          acceptedSessionKey = createTerminalStateKey(
            event.session.projectId,
            event.session.workspaceName,
            event.blockId
          )
        }

        return nextStates
      })
      if (acceptedSessionKey) clearPendingTerminalInput(acceptedSessionKey)
    })
  }, [clearPendingTerminalInput, updateTerminalStates])
}

function publishTerminalOutput(event: TerminalOutputEvent): void {
  window.dispatchEvent(
    new CustomEvent<TerminalOutputEvent>(terminalOutputBrowserEventName, { detail: event })
  )
}

interface TerminalRunEventRuntimeApi {
  readonly onTerminalRunEvent?: (listener: (event: TerminalServiceRunEvent) => void) => () => void
}
