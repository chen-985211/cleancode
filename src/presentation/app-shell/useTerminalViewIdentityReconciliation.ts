import { useCallback, type SetStateAction } from 'react'

import { reconcileStaleTerminalViewSnapshot } from './terminalSessionRuntime'
import type { TerminalRunIdentity, TerminalViewState } from './types'

export function useTerminalViewIdentityReconciliation(
  updateTerminalStates: (stateAction: SetStateAction<Record<string, TerminalViewState>>) => void
): (identity: TerminalRunIdentity) => void {
  return useCallback(
    (identity: TerminalRunIdentity) => {
      const api = window.cleancode
      if (!api?.listTerminalSessions) return

      void api
        .listTerminalSessions({ sessionIds: [identity.sessionId] })
        .then((sessions) => {
          updateTerminalStates((states) =>
            reconcileStaleTerminalViewSnapshot(states, identity, sessions)
          )
        })
        .catch(() => undefined)
    },
    [updateTerminalStates]
  )
}
