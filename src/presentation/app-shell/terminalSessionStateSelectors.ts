import {
  createTerminalStateKey,
  getBlockIdFromTerminalStateKey,
  getWorkspaceNameFromTerminalStateKey
} from './terminalSessionWorkspaceMigration'
import type { TerminalViewState } from './types'

export function resolveCurrentTerminalStateKey(
  workspaceName: string | null,
  blockId: string
): string | null {
  return workspaceName ? createTerminalStateKey(workspaceName, blockId) : null
}

export function selectTerminalStatesForWorkspace(
  states: Record<string, TerminalViewState>,
  workspaceName: string | null
): Record<string, TerminalViewState> {
  if (!workspaceName) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(states)
      .filter(
        ([terminalStateKey]) =>
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
