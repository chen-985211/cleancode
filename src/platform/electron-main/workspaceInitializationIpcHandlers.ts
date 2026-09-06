import type {
  WorkspaceInitializationDetails,
  WorkspaceInitializationResult,
  WorkspaceDefaults
} from '../../contexts/project/application/dto/WorkspaceInitializationDetails'
import type { InitializeWorkspaceContentCommand } from '../../contexts/project/application/use-cases/InitializeWorkspaceContentUseCase'
import type { BeginEmptyCanvasInitializationCommand } from '../../contexts/project/application/use-cases/PrepareWorkspaceInitializationUseCase'
import { normalizeWorkspaceDefaults } from '../../contexts/project/domain/value-objects/WorkspaceDefaults'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import { registerIpcHandler, type IpcMainLike } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'

export interface WorkspaceInitializationIpcInput {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly cancel: (projectDirectory: string, initializationId: string) => Promise<void>
  readonly getDefaults: (directory: string) => Promise<WorkspaceDefaults>
  readonly saveDefaults: (directory: string, defaults: WorkspaceDefaults) => Promise<void>
  readonly list: (query: {
    readonly projectDirectory: string
    readonly workspaceId?: string
  }) => Promise<readonly WorkspaceInitializationDetails[]>
  readonly begin: (
    command: BeginEmptyCanvasInitializationCommand
  ) => Promise<WorkspaceInitializationDetails>
  readonly apply: (
    command: InitializeWorkspaceContentCommand
  ) => Promise<WorkspaceInitializationResult>
}

export function registerWorkspaceInitializationIpcHandlers(
  input: WorkspaceInitializationIpcInput
): void {
  registerIpcHandler<unknown, void>({
    channel: 'cleancode:cancel-workspace-initialization',
    handler: (command) =>
      input.cancel(
        readString(command, 'projectDirectory'),
        readString(command, 'initializationId')
      ),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'cancelWorkspaceInitialization',
    scope: 'project.initialization'
  })
  registerIpcHandler<unknown, WorkspaceDefaults>({
    channel: 'cleancode:get-workspace-defaults',
    handler: (command) => input.getDefaults(readString(command, 'projectDirectory')),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'getWorkspaceDefaults',
    scope: 'project.initialization'
  })
  registerIpcHandler<unknown, void>({
    channel: 'cleancode:save-workspace-defaults',
    handler: (command) =>
      input.saveDefaults(readString(command, 'projectDirectory'), readDefaults(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'saveWorkspaceDefaults',
    scope: 'project.initialization',
    successLogLevel: 'info'
  })
  registerIpcHandler<unknown, readonly WorkspaceInitializationDetails[]>({
    channel: 'cleancode:list-workspace-initializations',
    handler: (command) =>
      input.list({
        projectDirectory: readString(command, 'projectDirectory'),
        ...(isRecord(command) && command.workspaceId !== undefined
          ? { workspaceId: readString(command, 'workspaceId') }
          : {})
      }),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'listWorkspaceInitializations',
    scope: 'project.initialization'
  })
  registerIpcHandler<unknown, WorkspaceInitializationDetails>({
    channel: 'cleancode:begin-workspace-initialization',
    handler: (command) =>
      input.begin({
        projectDirectory: readString(command, 'projectDirectory'),
        workspaceId: readString(command, 'workspaceId'),
        requestId: readString(command, 'requestId'),
        defaults: readDefaults(command)
      }),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'beginWorkspaceInitialization',
    scope: 'project.initialization',
    successLogLevel: 'info'
  })
  registerIpcHandler<unknown, WorkspaceInitializationResult>({
    channel: 'cleancode:apply-workspace-initialization',
    handler: (command) => input.apply(readApply(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'applyWorkspaceInitialization',
    scope: 'project.initialization',
    successLogLevel: 'info'
  })
}

function readApply(command: unknown): InitializeWorkspaceContentCommand {
  if (
    !isRecord(command) ||
    !Array.isArray(command.positions) ||
    (command.retryItemId !== undefined && command.skipItemId !== undefined)
  )
    invalid()
  const positions = command.positions.map((position: unknown) => {
    if (
      !isRecord(position) ||
      typeof position.x !== 'number' ||
      typeof position.y !== 'number' ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    )
      invalid()
    return { itemId: readString(position, 'itemId'), x: position.x, y: position.y }
  })
  if (new Set(positions.map((position) => position.itemId)).size !== positions.length) invalid()
  return {
    initializationId: readString(command, 'initializationId'),
    projectId: readString(command, 'projectId'),
    workspaceId: readString(command, 'workspaceId'),
    positions,
    ...(command.retryItemId !== undefined
      ? { retryItemId: readString(command, 'retryItemId') }
      : {}),
    ...(command.skipItemId !== undefined ? { skipItemId: readString(command, 'skipItemId') } : {})
  }
}
function readString(command: unknown, name: string): string {
  if (!isRecord(command) || typeof command[name] !== 'string' || !command[name].trim()) invalid()
  return command[name]
}
function readDefaults(command: unknown): WorkspaceDefaults {
  if (!isRecord(command) || command.defaults === undefined) invalid()
  return normalizeWorkspaceDefaults(command.defaults)
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}
function invalid(): never {
  throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid workspace initialization command.')
}
