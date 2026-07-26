import type { TerminalViewState } from './types'
import { createCanvasObjectIdentityKey } from '../../shared-kernel/domain/value-objects/CanvasObjectIdentity'

export interface TerminalSessionWorkspaceMigration {
  readonly sessionId: string
  readonly targetProjectId: string
  readonly targetBlockId?: string
  readonly targetWorkspaceId: string
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
    migration.targetWorkspaceId,
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
  workspaceId: string,
  blockId: string
): string {
  return createCanvasObjectIdentityKey({
    projectId,
    workspaceId,
    objectKind: 'terminal',
    objectId: blockId
  })
}

export function getProjectIdFromTerminalStateKey(terminalStateKey: string): string {
  return splitTerminalStateKey(terminalStateKey)[0]
}

export function getWorkspaceIdFromTerminalStateKey(terminalStateKey: string): string {
  return splitTerminalStateKey(terminalStateKey)[1]
}

export function getBlockIdFromTerminalStateKey(terminalStateKey: string): string {
  return splitTerminalStateKey(terminalStateKey)[2]
}

function splitTerminalStateKey(terminalStateKey: string): [string, string, string] {
  try {
    const value = JSON.parse(terminalStateKey) as unknown
    if (
      Array.isArray(value) &&
      value.length === 4 &&
      value[2] === 'terminal' &&
      value.every((part) => typeof part === 'string')
    ) {
      return [value[0], value[1], value[3]]
    }
  } catch {
    // Unknown renderer state keys are ignored by returning an empty identity.
  }

  return ['', '', '']
}
