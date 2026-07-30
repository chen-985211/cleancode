import type { BlockTemplateSnapshot } from '../../contexts/block-graph/application/dto/BlockTemplateSnapshot'
import type { DeleteBlockTemplateCommand } from '../../contexts/block-graph/application/use-cases/DeleteBlockTemplateUseCase'
import type {
  InstantiateBlockTemplateCommand,
  InstantiateBlockTemplateResult
} from '../../contexts/block-graph/application/use-cases/InstantiateBlockTemplateUseCase'
import type { ListBlockTemplatesQuery } from '../../contexts/block-graph/application/use-cases/ListBlockTemplatesUseCase'
import type { MoveBlockTemplateCommand } from '../../contexts/block-graph/application/use-cases/MoveBlockTemplateUseCase'
import type { SaveBlockTemplateCommand } from '../../contexts/block-graph/application/use-cases/SaveBlockTemplateUseCase'
import type { UpdateBlockTemplateCommand } from '../../contexts/block-graph/application/use-cases/UpdateBlockTemplateUseCase'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import { registerIpcHandler } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'

export interface BlockTemplateIpcHandlersInput {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly listBlockTemplates: (
    query: ListBlockTemplatesQuery
  ) => Promise<readonly BlockTemplateSnapshot[]>
  readonly saveBlockTemplate: (command: SaveBlockTemplateCommand) => Promise<BlockTemplateSnapshot>
  readonly updateBlockTemplate: (
    command: UpdateBlockTemplateCommand
  ) => Promise<BlockTemplateSnapshot>
  readonly moveBlockTemplate: (command: MoveBlockTemplateCommand) => Promise<BlockTemplateSnapshot>
  readonly deleteBlockTemplate: (command: DeleteBlockTemplateCommand) => Promise<void>
  readonly instantiateBlockTemplate: (
    command: InstantiateBlockTemplateCommand
  ) => Promise<InstantiateBlockTemplateResult>
}

export function registerBlockTemplateIpcHandlers(input: BlockTemplateIpcHandlersInput): void {
  registerIpcHandler<unknown, readonly BlockTemplateSnapshot[]>({
    channel: 'cleancode:list-block-templates',
    handler: (command) => input.listBlockTemplates(readListCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'listBlockTemplates',
    scope: 'block-graph.templates'
  })
  registerIpcHandler<unknown, BlockTemplateSnapshot>({
    channel: 'cleancode:save-block-template',
    handler: (command) => input.saveBlockTemplate(readSaveCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'saveBlockTemplate',
    scope: 'block-graph.templates',
    successLogLevel: 'info'
  })
  registerIpcHandler<unknown, BlockTemplateSnapshot>({
    channel: 'cleancode:update-block-template',
    handler: (command) => input.updateBlockTemplate(readUpdateCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'updateBlockTemplate',
    scope: 'block-graph.templates',
    successLogLevel: 'info'
  })
  registerIpcHandler<unknown, BlockTemplateSnapshot>({
    channel: 'cleancode:move-block-template',
    handler: (command) => input.moveBlockTemplate(readMoveCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'moveBlockTemplate',
    scope: 'block-graph.templates',
    successLogLevel: 'info'
  })
  registerIpcHandler<unknown, void>({
    channel: 'cleancode:delete-block-template',
    handler: (command) => input.deleteBlockTemplate(readDeleteCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'deleteBlockTemplate',
    scope: 'block-graph.templates',
    successLogLevel: 'info'
  })
  registerIpcHandler<unknown, InstantiateBlockTemplateResult>({
    channel: 'cleancode:instantiate-block-template',
    handler: (command) => input.instantiateBlockTemplate(readInstantiateCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'instantiateBlockTemplate',
    scope: 'block-graph.templates',
    successLogLevel: 'info'
  })
}

function readListCommand(command: unknown): ListBlockTemplatesQuery {
  if (!isRecord(command)) invalidCommand()
  return { scope: readScope(command.scope) }
}

function readSaveCommand(command: unknown): SaveBlockTemplateCommand {
  if (
    !isRecord(command) ||
    !isNonEmptyString(command.projectDirectory) ||
    !isNonEmptyString(command.workspaceId) ||
    !isNonEmptyString(command.name) ||
    typeof command.description !== 'string' ||
    !isNonEmptyStringArray(command.selectedBlockIds)
  ) {
    invalidCommand()
  }

  return {
    description: command.description,
    name: command.name,
    projectDirectory: command.projectDirectory,
    scope: readScope(command.scope),
    selectedBlockIds: command.selectedBlockIds,
    workspaceId: command.workspaceId
  }
}

function readUpdateCommand(command: unknown): UpdateBlockTemplateCommand {
  if (
    !isRecord(command) ||
    !isNonEmptyString(command.templateId) ||
    !isNonEmptyString(command.name) ||
    typeof command.description !== 'string'
  ) {
    invalidCommand()
  }
  return command as unknown as UpdateBlockTemplateCommand
}

function readMoveCommand(command: unknown): MoveBlockTemplateCommand {
  if (!isRecord(command) || !isNonEmptyString(command.templateId)) invalidCommand()
  return { scope: readScope(command.scope), templateId: command.templateId }
}

function readDeleteCommand(command: unknown): DeleteBlockTemplateCommand {
  if (!isRecord(command) || !isNonEmptyString(command.templateId)) invalidCommand()
  return { templateId: command.templateId }
}

function readInstantiateCommand(command: unknown): InstantiateBlockTemplateCommand {
  if (
    !isRecord(command) ||
    !isNonEmptyString(command.projectDirectory) ||
    !isNonEmptyString(command.workspaceId) ||
    !isNonEmptyString(command.templateId) ||
    !isFinitePosition(command.origin)
  ) {
    invalidCommand()
  }
  return command as unknown as InstantiateBlockTemplateCommand
}

function readScope(value: unknown): ListBlockTemplatesQuery['scope'] {
  if (!isRecord(value)) invalidCommand()
  if (value.type === 'global') return { type: 'global' }
  if (value.type === 'project' && isNonEmptyString(value.projectId)) {
    return { projectId: value.projectId, type: 'project' }
  }
  return invalidCommand()
}

function isFinitePosition(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  )
}

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(isNonEmptyString) &&
    new Set(value).size === value.length
  )
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function invalidCommand(): never {
  throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid block template IPC command.')
}
