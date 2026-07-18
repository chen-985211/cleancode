import type { TerminalViewState } from './types'

const terminalStateKeySeparator = '\0'

export interface TerminalSessionWorkspaceMigration {
  readonly sessionId: string
  readonly targetProjectId: string
  readonly targetBlockId?: string
  readonly targetWorkspaceName: string
}

export interface TerminalSessionWorkspaceMigrationResult {
  readonly states: Record<string, TerminalViewState>
  readonly migrated: boolean
}

export function migrateTerminalSessionToWorkspace(
  states: Record<string, TerminalViewState>,
  migration: TerminalSessionWorkspaceMigration
): TerminalSessionWorkspaceMigrationResult {
  const sourceEntry = Object.entries(states).find(
    ([, state]) => state.sessionId === migration.sessionId
  )

  if (!sourceEntry) {
    return { states, migrated: false }
  }

  const [sourceKey, sourceState] = sourceEntry
  const blockId = migration.targetBlockId ?? getBlockIdFromTerminalStateKey(sourceKey)
  const targetKey = createTerminalStateKey(
    migration.targetProjectId,
    migration.targetWorkspaceName,
    blockId
  )

  if (sourceKey === targetKey) {
    return { states, migrated: false }
  }

  const nextStates = { ...states }
  delete nextStates[sourceKey]
  nextStates[targetKey] = sourceState

  return { states: nextStates, migrated: true }
}

export function createTerminalStateKey(
  projectId: string,
  workspaceName: string,
  blockId: string
): string {
  return [projectId, workspaceName, blockId].join(terminalStateKeySeparator)
}

export function getProjectIdFromTerminalStateKey(terminalStateKey: string): string {
  return splitTerminalStateKey(terminalStateKey)[0]
}

export function getWorkspaceNameFromTerminalStateKey(terminalStateKey: string): string {
  return splitTerminalStateKey(terminalStateKey)[1]
}

export function getBlockIdFromTerminalStateKey(terminalStateKey: string): string {
  return splitTerminalStateKey(terminalStateKey)[2]
}

function splitTerminalStateKey(terminalStateKey: string): [string, string, string] {
  const [projectId = '', workspaceName = '', ...blockIdParts] =
    terminalStateKey.split(terminalStateKeySeparator)

  return [projectId, workspaceName, blockIdParts.join(terminalStateKeySeparator)]
}
