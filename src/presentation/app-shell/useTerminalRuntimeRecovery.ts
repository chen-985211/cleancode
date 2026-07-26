import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import type { TerminalRuntimeAvailabilitySnapshot } from '../../contexts/run/application/dto/TerminalRuntimeAvailability'
import { createTerminalStateKey } from './terminalSessionWorkspaceMigration'
import { selectTerminalStatesForWorkspace } from './terminalSessionStateSelectors'
import { applyRecoveredTerminalSessionSnapshot } from './terminalSessionRuntime'
import { createIdleTerminalState, type TerminalViewState } from './types'

interface TerminalRuntimeRecoveryInput {
  readonly currentProjectId: string | null
  readonly currentTerminalBlockIds: readonly string[] | undefined
  readonly currentWorkspaceId: string | null
  readonly runtimeAvailability: TerminalRuntimeAvailabilitySnapshot
  readonly terminalStatesByKey: Record<string, TerminalViewState>
  readonly updateTerminalStates: Dispatch<SetStateAction<Record<string, TerminalViewState>>>
}

export function useTerminalRuntimeRecovery({
  currentProjectId,
  currentTerminalBlockIds,
  currentWorkspaceId,
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
    isRuntimeReady && currentProjectId && currentWorkspaceId
      ? `${currentProjectId}\0${currentWorkspaceId}\0${runtimeAvailability.epoch}`
      : null
  const terminalStates = useMemo(() => {
    const selected = selectTerminalStatesForWorkspace(
      terminalStatesByKey,
      currentProjectId,
      currentWorkspaceId
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
    currentWorkspaceId,
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
      !currentWorkspaceId
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
            session.workspaceId === currentWorkspaceId &&
            (!currentTerminalBlockIds || currentTerminalBlockIds.includes(session.blockId))
        )
        updateTerminalStates((states) =>
          visible.reduce(
            (nextStates, session) =>
              applyRecoveredTerminalSessionSnapshot(
                nextStates,
                createTerminalStateKey(session.projectId, session.workspaceId, session.blockId),
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
    currentWorkspaceId,
    isRuntimeReady,
    recoveryKey,
    updateTerminalStates
  ])

  return terminalStates
}
