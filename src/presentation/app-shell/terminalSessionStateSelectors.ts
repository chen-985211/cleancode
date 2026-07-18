import {
  createTerminalStateKey,
  getBlockIdFromTerminalStateKey,
  getProjectIdFromTerminalStateKey,
  getWorkspaceNameFromTerminalStateKey
} from './terminalSessionWorkspaceMigration'
import type { TerminalViewState } from './types'

export function resolveCurrentTerminalStateKey(
  projectId: string | null,
  workspaceName: string | null,
  blockId: string
): string | null {
  return projectId && workspaceName
    ? createTerminalStateKey(projectId, workspaceName, blockId)
    : null
}

export function selectTerminalStatesForWorkspace(
  states: Record<string, TerminalViewState>,
  projectId: string | null,
  workspaceName: string | null
): Record<string, TerminalViewState> {
  if (!projectId || !workspaceName) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(states)
      .filter(
        ([terminalStateKey]) =>
          getProjectIdFromTerminalStateKey(terminalStateKey) === projectId &&
          getWorkspaceNameFromTerminalStateKey(terminalStateKey) === workspaceName
      )
      .map(([terminalStateKey, state]) => [getBlockIdFromTerminalStateKey(terminalStateKey), state])
  )
}

export function findTerminalStateKeyBySession(
  states: Record<string, TerminalViewState>,
  sessionId: string
): string | null {
  return Object.entries(states).find(([, state]) => state.sessionId === sessionId)?.[0] ?? null
}
