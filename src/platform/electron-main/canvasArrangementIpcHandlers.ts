import type {
  CanvasArrangementItemReference,
  CanvasArrangementSnapshot
} from '../../contexts/canvas-arrangement/application/dto/CanvasArrangementSnapshot'
import type { CreateCanvasStackCommand } from '../../contexts/canvas-arrangement/application/use-cases/CreateCanvasStackUseCase'
import type { RemoveCanvasStackCommand } from '../../contexts/canvas-arrangement/application/use-cases/RemoveCanvasStackUseCase'
import type { MoveCanvasStackCommand } from '../../contexts/canvas-arrangement/application/use-cases/MoveCanvasStackUseCase'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import { registerIpcHandler } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'

export interface CanvasArrangementIpcHandlersInput {
  readonly createStack: (command: CreateCanvasStackCommand) => Promise<CanvasArrangementSnapshot>
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly moveStack: (command: MoveCanvasStackCommand) => Promise<CanvasArrangementSnapshot>
  readonly removeStack: (command: RemoveCanvasStackCommand) => Promise<CanvasArrangementSnapshot>
}

export function registerCanvasArrangementIpcHandlers(
  input: CanvasArrangementIpcHandlersInput
): void {
  registerIpcHandler<unknown, CanvasArrangementSnapshot>({
    channel: 'cleancode:move-canvas-stack',
    handler: (command) => input.moveStack(readMoveStackCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'moveCanvasStack',
    scope: 'canvas.arrangement'
  })
  registerIpcHandler<unknown, CanvasArrangementSnapshot>({
    channel: 'cleancode:create-canvas-stack',
    handler: (command) => input.createStack(readCreateStackCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'createCanvasStack',
    scope: 'canvas.arrangement',
    successLogLevel: 'info'
  })
  registerIpcHandler<unknown, CanvasArrangementSnapshot>({
    channel: 'cleancode:remove-canvas-stack',
    handler: (command) => input.removeStack(readRemoveStackCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'removeCanvasStack',
    scope: 'canvas.arrangement',
    successLogLevel: 'info'
  })
}

function readMoveStackCommand(command: unknown): MoveCanvasStackCommand {
  if (
    !isRecord(command) ||
    !hasExactKeys(command, ['anchor', 'projectDirectory', 'projectId', 'stackId', 'workspaceId']) ||
    !isPosition(command.anchor) ||
    !isNonEmptyString(command.projectDirectory) ||
    !isNonEmptyString(command.projectId) ||
    !isNonEmptyString(command.stackId) ||
    !isNonEmptyString(command.workspaceId)
  ) {
    invalidCommand()
  }
  return command as unknown as MoveCanvasStackCommand
}

function readCreateStackCommand(command: unknown): CreateCanvasStackCommand {
  if (
    !isRecord(command) ||
    !hasExactKeys(command, [
      'anchor',
      'items',
      'projectDirectory',
      'projectId',
      'stackId',
      'workspaceId'
    ]) ||
    !isPosition(command.anchor) ||
    !Array.isArray(command.items) ||
    command.items.length < 2 ||
    !isNonEmptyString(command.projectDirectory) ||
    !isNonEmptyString(command.projectId) ||
    !isNonEmptyString(command.stackId) ||
    !isNonEmptyString(command.workspaceId)
  ) {
    invalidCommand()
  }

  const items = command.items.map(readItem)

  return {
    anchor: command.anchor,
    items,
    projectDirectory: command.projectDirectory,
    projectId: command.projectId,
    stackId: command.stackId,
    workspaceId: command.workspaceId
  }
}

function readRemoveStackCommand(command: unknown): RemoveCanvasStackCommand {
  if (
    !isRecord(command) ||
    !hasExactKeys(command, ['projectDirectory', 'projectId', 'stackId', 'workspaceId']) ||
    !isNonEmptyString(command.projectDirectory) ||
    !isNonEmptyString(command.projectId) ||
    !isNonEmptyString(command.stackId) ||
    !isNonEmptyString(command.workspaceId)
  ) {
    invalidCommand()
  }
  return command as unknown as RemoveCanvasStackCommand
}

function readItem(item: unknown): CanvasArrangementItemReference {
  if (!isRecord(item)) invalidCommand()
  if (
    item.kind === 'terminal' &&
    hasExactKeys(item, ['kind', 'terminalId']) &&
    isNonEmptyString(item.terminalId)
  ) {
    return { kind: item.kind, terminalId: item.terminalId }
  }
  if (
    item.kind === 'workflow' &&
    hasExactKeys(item, ['kind', 'terminalIds']) &&
    Array.isArray(item.terminalIds) &&
    item.terminalIds.length >= 2 &&
    item.terminalIds.every(isNonEmptyString) &&
    new Set(item.terminalIds).size === item.terminalIds.length
  ) {
    return { kind: item.kind, terminalIds: item.terminalIds }
  }
  if (
    item.kind === 'combination' &&
    hasExactKeys(item, ['kind', 'terminalGroupId']) &&
    isNonEmptyString(item.terminalGroupId)
  ) {
    return { kind: item.kind, terminalGroupId: item.terminalGroupId }
  }
  if (
    item.kind === 'agent' &&
    hasExactKeys(item, ['kind', 'agentId']) &&
    isNonEmptyString(item.agentId)
  ) {
    return { kind: item.kind, agentId: item.agentId }
  }
  invalidCommand()
}

function isPosition(value: unknown): value is { readonly x: number; readonly y: number } {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['x', 'y']) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys)
  return (
    Object.keys(record).length === keys.length &&
    Object.keys(record).every((key) => allowed.has(key))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidCommand(): never {
  throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid canvas arrangement IPC command.')
}
