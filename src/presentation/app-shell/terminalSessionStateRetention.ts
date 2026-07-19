import {
  getBlockIdFromTerminalStateKey,
  getProjectIdFromTerminalStateKey,
  getWorkspaceNameFromTerminalStateKey
} from './terminalSessionWorkspaceMigration'
import type { TerminalViewState } from './types'

export interface TerminalStateReconciliationInput {
  readonly projectId: string
  readonly workspaceNames: readonly string[]
  readonly currentWorkspaceName: string
  readonly currentTerminalBlockIds: readonly string[]
}

export function removeWorkspaceTerminalStates(
  states: Record<string, TerminalViewState>,
  projectId: string,
  workspaceName: string
): Record<string, TerminalViewState> {
  return filterTerminalStates(
    states,
    (key) =>
      getProjectIdFromTerminalStateKey(key) !== projectId ||
      getWorkspaceNameFromTerminalStateKey(key) !== workspaceName
  )
}

export function reconcileTerminalStates(
  states: Record<string, TerminalViewState>,
  input: TerminalStateReconciliationInput
): Record<string, TerminalViewState> {
  const workspaceNames = new Set(input.workspaceNames)
  const currentTerminalBlockIds = new Set(input.currentTerminalBlockIds)

  return filterTerminalStates(states, (key) => {
    if (getProjectIdFromTerminalStateKey(key) !== input.projectId) {
      return true
    }

    const workspaceName = getWorkspaceNameFromTerminalStateKey(key)
    if (!workspaceNames.has(workspaceName)) {
      return false
    }

    return (
      workspaceName !== input.currentWorkspaceName ||
      currentTerminalBlockIds.has(getBlockIdFromTerminalStateKey(key))
    )
  })
}

function filterTerminalStates(
  states: Record<string, TerminalViewState>,
  shouldKeep: (key: string) => boolean
): Record<string, TerminalViewState> {
  const nextEntries = Object.entries(states).filter(([key]) => shouldKeep(key))

  return nextEntries.length === Object.keys(states).length
    ? states
    : Object.fromEntries(nextEntries)
}
