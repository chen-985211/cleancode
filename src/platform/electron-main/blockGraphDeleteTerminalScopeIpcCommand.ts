import type { BatchTerminalRemovalTargetSnapshot } from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'

export interface DeleteTerminalScopeIpcCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly target: BatchTerminalRemovalTargetSnapshot
}

export function readDeleteTerminalScopeCommand(command: unknown): DeleteTerminalScopeIpcCommand {
  if (
    !isRecord(command) ||
    !hasExactKeys(command, ['projectDirectory', 'workspaceId', 'target']) ||
    typeof command.projectDirectory !== 'string' ||
    command.projectDirectory.length === 0 ||
    typeof command.workspaceId !== 'string' ||
    command.workspaceId.length === 0 ||
    !isBatchTerminalRemovalTarget(command.target)
  ) {
    throw createExpectedAppError(
      'INVALID_IPC_COMMAND',
      'Invalid IPC command: complete terminal removal scope is required.'
    )
  }

  return command as unknown as DeleteTerminalScopeIpcCommand
}

function isBatchTerminalRemovalTarget(value: unknown): value is BatchTerminalRemovalTargetSnapshot {
  if (!isRecord(value) || !hasUniqueTerminalBlockIds(value.terminalBlockIds)) return false
  if (value.type === 'workflow') {
    return hasExactKeys(value, ['type', 'terminalBlockIds'])
  }
  return (
    value.type === 'combination' &&
    hasExactKeys(value, ['type', 'terminalGroupId', 'terminalBlockIds']) &&
    typeof value.terminalGroupId === 'string' &&
    value.terminalGroupId.length > 0
  )
}

function hasUniqueTerminalBlockIds(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((id) => typeof id === 'string' && id.length > 0) &&
    new Set(value).size === value.length
  )
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowedKeys = new Set(keys)
  return (
    Object.keys(record).length === keys.length &&
    Object.keys(record).every((key) => allowedKeys.has(key))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
