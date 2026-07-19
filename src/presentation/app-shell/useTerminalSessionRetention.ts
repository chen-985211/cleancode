import { useCallback, useEffect, type SetStateAction } from 'react'

import {
  getProjectIdFromTerminalStateKey,
  getWorkspaceNameFromTerminalStateKey
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
  readonly currentWorkspaceName: string | null
  readonly terminalStatesRef: { readonly current: Record<string, TerminalViewState> }
  readonly updateTerminalStates: (
    stateAction: SetStateAction<Record<string, TerminalViewState>>
  ) => void
}

export function useTerminalSessionRetention({
  clearPendingTerminalInput,
  currentProject,
  currentTerminalBlockIds,
  currentWorkspaceName,
  terminalStatesRef,
  updateTerminalStates
}: UseTerminalSessionRetentionInput) {
  useEffect(() => {
    if (!currentProject || !currentWorkspaceName || !currentTerminalBlockIds) {
      return
    }

    updateTerminalStates((states) =>
      reconcileTerminalStates(states, {
        projectId: currentProject.id,
        workspaceNames: currentProject.workspaces.map((workspace) => workspace.name),
        currentWorkspaceName,
        currentTerminalBlockIds
      })
    )
  }, [currentProject, currentTerminalBlockIds, currentWorkspaceName, updateTerminalStates])

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
      const workspaceNames = new Set(
        workbench.project.workspaces.map((workspace) => workspace.name)
      )
      const terminalStateKeys = Object.keys(terminalStatesRef.current).filter(
        (terminalStateKey) =>
          getProjectIdFromTerminalStateKey(terminalStateKey) === workbench.project.id &&
          workspaceNames.has(getWorkspaceNameFromTerminalStateKey(terminalStateKey))
      )

      await terminateTerminalStateKeys(terminalStateKeys)
    },
    [terminalStatesRef, terminateTerminalStateKeys]
  )

  const terminateWorkspaceTerminalSessions = useCallback(
    async (workbench: WorkbenchSnapshot, workspaceName: string) => {
      const terminalStateKeys = Object.keys(terminalStatesRef.current).filter(
        (terminalStateKey) =>
          getProjectIdFromTerminalStateKey(terminalStateKey) === workbench.project.id &&
          getWorkspaceNameFromTerminalStateKey(terminalStateKey) === workspaceName
      )

      await terminateTerminalStateKeys(terminalStateKeys)
    },
    [terminalStatesRef, terminateTerminalStateKeys]
  )

  const forgetWorkspaceTerminalStates = useCallback(
    (projectId: string, workspaceName: string) =>
      updateTerminalStates((states) =>
        removeWorkspaceTerminalStates(states, projectId, workspaceName)
      ),
    [updateTerminalStates]
  )

  return {
    forgetWorkspaceTerminalStates,
    terminateWorkbenchTerminalSessions,
    terminateWorkspaceTerminalSessions
  }
}
