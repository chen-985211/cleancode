import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'

interface TerminalContainerScope {
  readonly projectDirectory: string
  readonly workspaceId: string
}

interface TerminalContainerPosition {
  readonly x: number
  readonly y: number
}

export interface CreateTerminalBlockIpcCommand extends TerminalContainerScope {
  readonly name: string
  readonly description: string
  readonly position: TerminalContainerPosition
  readonly terminalGroupId?: string
}

export interface CreateTerminalGroupIpcCommand extends TerminalContainerScope {
  readonly name: string
  readonly position: TerminalContainerPosition
}

export interface MoveTerminalWorkflowToGroupIpcCommand extends TerminalContainerScope {
  readonly blockId: string
  readonly targetTerminalGroupId: string | null
  readonly position: TerminalContainerPosition
}

export function readCreateTerminalBlockCommand(command: unknown): CreateTerminalBlockIpcCommand {
  const keys =
    isRecord(command) && 'terminalGroupId' in command
      ? ['projectDirectory', 'workspaceId', 'name', 'description', 'position', 'terminalGroupId']
      : ['projectDirectory', 'workspaceId', 'name', 'description', 'position']
  if (
    !isRecord(command) ||
    !hasExactKeys(command, keys) ||
    typeof command.projectDirectory !== 'string' ||
    typeof command.workspaceId !== 'string' ||
    typeof command.name !== 'string' ||
    typeof command.description !== 'string' ||
    !isPosition(command.position) ||
    (command.terminalGroupId !== undefined && typeof command.terminalGroupId !== 'string')
  ) {
    throwInvalidTerminalContainerCommand()
  }
  return command as unknown as CreateTerminalBlockIpcCommand
}

export function readCreateTerminalGroupCommand(command: unknown): CreateTerminalGroupIpcCommand {
  if (
    !isRecord(command) ||
    !hasExactKeys(command, ['projectDirectory', 'workspaceId', 'name', 'position']) ||
    typeof command.projectDirectory !== 'string' ||
    typeof command.workspaceId !== 'string' ||
    typeof command.name !== 'string' ||
    !isPosition(command.position)
  ) {
    throwInvalidTerminalContainerCommand()
  }
  return command as unknown as CreateTerminalGroupIpcCommand
}

export function readMoveTerminalWorkflowToGroupCommand(
  command: unknown
): MoveTerminalWorkflowToGroupIpcCommand {
  if (
    !isRecord(command) ||
    !hasExactKeys(command, [
      'projectDirectory',
      'workspaceId',
      'blockId',
      'targetTerminalGroupId',
      'position'
    ]) ||
    typeof command.projectDirectory !== 'string' ||
    typeof command.workspaceId !== 'string' ||
    typeof command.blockId !== 'string' ||
    !isPosition(command.position) ||
    (command.targetTerminalGroupId !== null && typeof command.targetTerminalGroupId !== 'string')
  ) {
    throwInvalidTerminalContainerCommand()
  }
  return command as unknown as MoveTerminalWorkflowToGroupIpcCommand
}

function throwInvalidTerminalContainerCommand(): never {
  throw createExpectedAppError(
    'INVALID_IPC_COMMAND',
    'Invalid IPC command: terminal container command is required.'
  )
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowedKeys = new Set(keys)
  return (
    Object.keys(record).length === keys.length &&
    Object.keys(record).every((key) => allowedKeys.has(key))
  )
}

function isPosition(value: unknown): value is TerminalContainerPosition {
  return (
    isRecord(value) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
