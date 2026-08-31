import { useEffect, type SetStateAction } from 'react'

import { appendTerminalOutput, bufferTerminalStartupOutput } from './terminalSessionOutputBuffer'
import { findTerminalStateKeyBySession } from './terminalSessionStateSelectors'
import { createTerminalStateKey } from './terminalSessionWorkspaceMigration'
import {
  applyTerminalServiceRunEvent,
  type TerminalServiceRunEvent
} from './terminalServiceRunProjection'
import {
  applyTerminalExitEvent,
  applyTerminalSessionStatusSnapshot
} from './terminalSessionRuntime'
import { applyTerminalWorkflowEventToStates } from './terminalWorkflowSessionEvents'
import type { TerminalSurfaceRegistry } from '../../contexts/run/presentation/terminal-surface/terminalSurfaceRegistry'
import type { TerminalViewState } from './types'

interface UseTerminalSessionEventsInput {
  readonly clearPendingTerminalInput: (terminalStateKey: string) => void
  readonly terminalStartupOutputsRef: { readonly current: Map<string, string> }
  readonly terminalSurfaceRegistry: TerminalSurfaceRegistry
  readonly terminalStatesRef: { readonly current: Record<string, TerminalViewState> }
  readonly updateTerminalStates: (
    stateAction: SetStateAction<Record<string, TerminalViewState>>
  ) => void
}

export function useTerminalSessionEvents({
  clearPendingTerminalInput,
  terminalStartupOutputsRef,
  terminalSurfaceRegistry,
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
    })
    const unsubscribeViewOutput =
      typeof api.onTerminalViewOutput === 'function'
        ? api.onTerminalViewOutput((event) => {
            terminalSurfaceRegistry.write(event)
          })
        : () => undefined
    const unsubscribeExit = api.onTerminalExit((event) => {
      const exitedTerminalStateKey = findTerminalStateKeyBySession(
        terminalStatesRef.current,
        event.sessionId
      )

      if (exitedTerminalStateKey) clearPendingTerminalInput(exitedTerminalStateKey)
      updateTerminalStates((states) => applyTerminalExitEvent(states, event))
    })
    const unsubscribeSessionUpdated =
      typeof api.onTerminalSessionUpdated === 'function'
        ? api.onTerminalSessionUpdated((session) => {
            const terminalStateKey = findTerminalStateKeyBySession(
              terminalStatesRef.current,
              session.sessionId
            )
            if (!terminalStateKey) return
            updateTerminalStates((states) =>
              applyTerminalSessionStatusSnapshot(states, terminalStateKey, session)
            )
          })
        : () => undefined

    return () => {
      unsubscribeOutput()
      unsubscribeViewOutput()
      unsubscribeExit()
      unsubscribeSessionUpdated()
    }
  }, [
    clearPendingTerminalInput,
    terminalStartupOutputsRef,
    terminalSurfaceRegistry,
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
      let acceptedSessionKey: string | null = null
      updateTerminalStates((states) => {
        const nextStates = applyTerminalWorkflowEventToStates(states, event)

        if (event.type === 'terminal-session-started' && nextStates !== states) {
          acceptedSessionKey = createTerminalStateKey(
            event.session.projectId,
            event.session.workspaceId,
            event.blockId
          )
        }

        return nextStates
      })
      if (acceptedSessionKey) clearPendingTerminalInput(acceptedSessionKey)
    })
  }, [clearPendingTerminalInput, terminalSurfaceRegistry, updateTerminalStates])
}

interface TerminalRunEventRuntimeApi {
  readonly onTerminalRunEvent?: (listener: (event: TerminalServiceRunEvent) => void) => () => void
}
