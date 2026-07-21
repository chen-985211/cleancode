import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import type { TerminalRuntimeAvailabilitySnapshot } from '../../contexts/run/application/dto/TerminalRuntimeAvailability'
import { createTerminalStateKey } from './terminalSessionWorkspaceMigration'
import { selectTerminalStatesForWorkspace } from './terminalSessionStateSelectors'
import { applyRecoveredTerminalSessionSnapshot } from './terminalSessionRuntime'
import { createIdleTerminalState, type TerminalViewState } from './types'

interface TerminalRuntimeRecoveryInput {
  readonly currentProjectId: string | null
  readonly currentTerminalBlockIds: readonly string[] | undefined
  readonly currentWorkspaceName: string | null
  readonly runtimeAvailability: TerminalRuntimeAvailabilitySnapshot
  readonly terminalStatesByKey: Record<string, TerminalViewState>
  readonly updateTerminalStates: Dispatch<SetStateAction<Record<string, TerminalViewState>>>
}

export function useTerminalRuntimeRecovery({
  currentProjectId,
  currentTerminalBlockIds,
  currentWorkspaceName,
  runtimeAvailability,
  terminalStatesByKey,
  updateTerminalStates
}: TerminalRuntimeRecoveryInput): Record<string, TerminalViewState> {
  const [reconciledRecoveryKey, setReconciledRecoveryKey] = useState<string | null>(null)
  const isRuntimeReady = runtimeAvailability.phase === 'ready'
  const canReconcileRecoveredSessions = Boolean(
    window.cleancode && typeof window.cleancode.listRecoveredTerminalSessions === 'function'
  )
  const recoveryKey =
    isRuntimeReady && currentProjectId && currentWorkspaceName
      ? `${currentProjectId}\0${currentWorkspaceName}\0${runtimeAvailability.epoch}`
      : null
  const terminalStates = useMemo(() => {
    const selected = selectTerminalStatesForWorkspace(
      terminalStatesByKey,
      currentProjectId,
      currentWorkspaceName
    )
    if (
      (isRuntimeReady &&
        (!canReconcileRecoveredSessions ||
          (recoveryKey && reconciledRecoveryKey === recoveryKey))) ||
      !currentTerminalBlockIds
    ) {
      return selected
    }
    return Object.fromEntries(
      currentTerminalBlockIds.map((blockId) => [
        blockId,
        {
          ...(selected[blockId] ?? createIdleTerminalState()),
          isRecoveryPending: true
        }
      ])
    )
  }, [
    currentProjectId,
    currentTerminalBlockIds,
    currentWorkspaceName,
    canReconcileRecoveredSessions,
    isRuntimeReady,
    reconciledRecoveryKey,
    recoveryKey,
    terminalStatesByKey
  ])

  useEffect(() => {
    const api = window.cleancode
    if (
      !isRuntimeReady ||
      !recoveryKey ||
      !api?.listRecoveredTerminalSessions ||
      !currentProjectId ||
      !currentWorkspaceName
    ) {
      return undefined
    }
    let isCurrentRequest = true
    void Promise.all([
      api.listRecoveredTerminalSessions(),
      api.listRecoveredTerminalServiceEndpoints?.() ?? Promise.resolve([])
    ])
      .then(([sessions, endpoints]) => {
        if (!isCurrentRequest) return
        const endpointsBySession = new Map(
          endpoints.map(({ sessionId, endpoint }) => [sessionId, endpoint])
        )
        const visible = sessions.filter(
          (session) =>
            session.projectId === currentProjectId &&
            session.workspaceName === currentWorkspaceName &&
            (!currentTerminalBlockIds || currentTerminalBlockIds.includes(session.blockId))
        )
        updateTerminalStates((states) =>
          visible.reduce(
            (nextStates, session) =>
              applyRecoveredTerminalSessionSnapshot(
                nextStates,
                createTerminalStateKey(session.projectId, session.workspaceName, session.blockId),
                session,
                '',
                endpointsBySession.get(session.id) ?? null
              ),
            states
          )
        )
        setReconciledRecoveryKey(recoveryKey)
      })
      .catch(() => undefined)
    return () => {
      isCurrentRequest = false
    }
  }, [
    currentProjectId,
    currentTerminalBlockIds,
    currentWorkspaceName,
    isRuntimeReady,
    recoveryKey,
    updateTerminalStates
  ])

  return terminalStates
}
