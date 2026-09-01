import {
  getBlockIdFromTerminalStateKey,
  getProjectIdFromTerminalStateKey,
  getWorkspaceIdFromTerminalStateKey
} from './terminalSessionWorkspaceMigration'
import type { TerminalViewState } from './TerminalPresentationTypes'

export interface TerminalStateReconciliationInput {
  readonly projectId: string
  readonly workspaceIds: readonly string[]
  readonly currentWorkspaceId: string
  readonly currentTerminalBlockIds: readonly string[]
}

export function removeWorkspaceTerminalStates(
  states: Record<string, TerminalViewState>,
  projectId: string,
  workspaceId: string
): Record<string, TerminalViewState> {
  return filterTerminalStates(
    states,
    (key) =>
      getProjectIdFromTerminalStateKey(key) !== projectId ||
      getWorkspaceIdFromTerminalStateKey(key) !== workspaceId
  )
}

export function reconcileTerminalStates(
  states: Record<string, TerminalViewState>,
  input: TerminalStateReconciliationInput
): Record<string, TerminalViewState> {
  const workspaceIds = new Set(input.workspaceIds)
  const currentTerminalBlockIds = new Set(input.currentTerminalBlockIds)

  return filterTerminalStates(states, (key) => {
    if (getProjectIdFromTerminalStateKey(key) !== input.projectId) {
      return true
    }

    const workspaceId = getWorkspaceIdFromTerminalStateKey(key)
    if (!workspaceIds.has(workspaceId)) {
      return false
    }

    return (
      workspaceId !== input.currentWorkspaceId ||
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
