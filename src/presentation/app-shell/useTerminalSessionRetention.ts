import { useCallback, useEffect, type SetStateAction } from 'react'

import {
  getProjectIdFromTerminalStateKey,
  getWorkspaceIdFromTerminalStateKey
} from './terminalSessionWorkspaceMigration'
import {
  reconcileTerminalStates,
  removeWorkspaceTerminalStates
} from './terminalSessionStateRetention'
import type { TerminalViewState, WorkbenchSnapshot } from './types'

interface UseTerminalSessionRetentionInput {
  readonly clearPendingTerminalInput: (terminalStateKey: string) => void
  readonly currentProject: WorkbenchSnapshot['project'] | undefined
  readonly currentTerminalBlockIds: readonly string[] | undefined
  readonly currentWorkspaceId: string | null
  readonly terminalStatesRef: { readonly current: Record<string, TerminalViewState> }
  readonly updateTerminalStates: (
    stateAction: SetStateAction<Record<string, TerminalViewState>>
  ) => void
}

export function useTerminalSessionRetention({
  clearPendingTerminalInput,
  currentProject,
  currentTerminalBlockIds,
  currentWorkspaceId,
  terminalStatesRef,
  updateTerminalStates
}: UseTerminalSessionRetentionInput) {
  useEffect(() => {
    if (!currentProject || !currentWorkspaceId || !currentTerminalBlockIds) {
      return
    }

    updateTerminalStates((states) =>
      reconcileTerminalStates(states, {
        projectId: currentProject.id,
        workspaceIds: currentProject.workspaces.map((workspace) => workspace.workspaceId),
        currentWorkspaceId,
        currentTerminalBlockIds
      })
    )
  }, [currentProject, currentTerminalBlockIds, currentWorkspaceId, updateTerminalStates])

  const terminateTerminalStateKeys = useCallback(
    async (terminalStateKeys: readonly string[]): Promise<void> => {
      const sessionIds = terminalStateKeys
        .map((terminalStateKey) => terminalStatesRef.current[terminalStateKey]?.sessionId)
        .filter((sessionId): sessionId is string => Boolean(sessionId))

      updateTerminalStates((states) => {
        const nextStates = { ...states }

        for (const terminalStateKey of terminalStateKeys) {
          clearPendingTerminalInput(terminalStateKey)
          delete nextStates[terminalStateKey]
        }

        return nextStates
      })
      await Promise.all(
        sessionIds.map((sessionId) => window.cleancode?.terminateTerminal({ sessionId }))
      )
    },
    [clearPendingTerminalInput, terminalStatesRef, updateTerminalStates]
  )

  const terminateWorkbenchTerminalSessions = useCallback(
    async (workbench: WorkbenchSnapshot) => {
      const workspaceIds = new Set(
        workbench.project.workspaces.map((workspace) => workspace.workspaceId)
      )
      const terminalStateKeys = Object.keys(terminalStatesRef.current).filter(
        (terminalStateKey) =>
          getProjectIdFromTerminalStateKey(terminalStateKey) === workbench.project.id &&
          workspaceIds.has(getWorkspaceIdFromTerminalStateKey(terminalStateKey))
      )

      await terminateTerminalStateKeys(terminalStateKeys)
    },
    [terminalStatesRef, terminateTerminalStateKeys]
  )

  const terminateWorkspaceTerminalSessions = useCallback(
    async (workbench: WorkbenchSnapshot, workspaceId: string) => {
      const terminalStateKeys = Object.keys(terminalStatesRef.current).filter(
        (terminalStateKey) =>
          getProjectIdFromTerminalStateKey(terminalStateKey) === workbench.project.id &&
          getWorkspaceIdFromTerminalStateKey(terminalStateKey) === workspaceId
      )

      await terminateTerminalStateKeys(terminalStateKeys)
    },
    [terminalStatesRef, terminateTerminalStateKeys]
  )

  const forgetWorkspaceTerminalStates = useCallback(
    (projectId: string, workspaceId: string) =>
      updateTerminalStates((states) =>
        removeWorkspaceTerminalStates(states, projectId, workspaceId)
      ),
    [updateTerminalStates]
  )

  return {
    forgetWorkspaceTerminalStates,
    terminateWorkbenchTerminalSessions,
    terminateWorkspaceTerminalSessions
  }
}
