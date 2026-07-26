import {
  createTerminalStateKey,
  getBlockIdFromTerminalStateKey,
  getProjectIdFromTerminalStateKey,
  getWorkspaceIdFromTerminalStateKey
} from './terminalSessionWorkspaceMigration'
import type { TerminalViewState } from './types'

export function resolveCurrentTerminalStateKey(
  projectId: string | null,
  workspaceId: string | null,
  blockId: string
): string | null {
  return projectId && workspaceId ? createTerminalStateKey(projectId, workspaceId, blockId) : null
}

export function selectTerminalStatesForWorkspace(
  states: Record<string, TerminalViewState>,
  projectId: string | null,
  workspaceId: string | null
): Record<string, TerminalViewState> {
  if (!projectId || !workspaceId) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(states)
      .filter(
        ([terminalStateKey]) =>
          getProjectIdFromTerminalStateKey(terminalStateKey) === projectId &&
          getWorkspaceIdFromTerminalStateKey(terminalStateKey) === workspaceId
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
