import type {
  BlockGraphSnapshot,
  CanvasViewportSnapshot,
  TerminalExecutionConfigSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import { registerIpcHandler } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'

interface TerminalDefinitionIpcCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly blockId: string
  readonly name: string
  readonly description: string
  readonly launchCommand: string
  readonly executionConfig: TerminalExecutionConfigSnapshot
}

export interface BlockGraphIpcHandlersInput {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly createTerminalBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly name: string
    readonly description: string
    readonly position: { readonly x: number; readonly y: number }
  }) => Promise<BlockGraphSnapshot>
  readonly createTerminalGroup: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly name: string
    readonly memberBlockIds: readonly string[]
  }) => Promise<BlockGraphSnapshot>
  readonly connectTerminalBlocks: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly sourceBlockId: string
    readonly targetBlockId: string
  }) => Promise<BlockGraphSnapshot>
  readonly disconnectTerminalBlocks: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly connectionId: string
  }) => Promise<BlockGraphSnapshot>
  readonly moveBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly blockId: string
    readonly position: { readonly x: number; readonly y: number }
  }) => Promise<BlockGraphSnapshot>
  readonly moveTerminalGroup: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly terminalGroupId: string
    readonly position: { readonly x: number; readonly y: number }
  }) => Promise<BlockGraphSnapshot>
  readonly updateTerminalBlockMetadata: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly blockId: string
    readonly name: string
    readonly description: string
    readonly launchCommand: string
  }) => Promise<BlockGraphSnapshot>
  readonly updateTerminalExecutionConfig: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly blockId: string
    readonly executionConfig: TerminalExecutionConfigSnapshot
  }) => Promise<BlockGraphSnapshot>
  readonly updateTerminalDefinition: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly blockId: string
    readonly name: string
    readonly description: string
    readonly launchCommand: string
    readonly executionConfig: TerminalExecutionConfigSnapshot
  }) => Promise<BlockGraphSnapshot>
  readonly updateTerminalGroupMetadata: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly terminalGroupId: string
    readonly name: string
  }) => Promise<BlockGraphSnapshot>
  readonly setTerminalGroupCollapsed: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly terminalGroupId: string
    readonly isCollapsed: boolean
  }) => Promise<BlockGraphSnapshot>
  readonly addTerminalToGroup: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly terminalGroupId: string
    readonly blockId: string
  }) => Promise<BlockGraphSnapshot>
  readonly removeTerminalFromGroup: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly terminalGroupId: string
    readonly blockId: string
  }) => Promise<BlockGraphSnapshot>
  readonly dissolveTerminalGroup: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly terminalGroupId: string
  }) => Promise<BlockGraphSnapshot>
  readonly resizeTerminalBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly blockId: string
    readonly position: { readonly x: number; readonly y: number }
    readonly size: { readonly width: number; readonly height: number }
  }) => Promise<BlockGraphSnapshot>
  readonly updateGraphViewport: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly viewport: CanvasViewportSnapshot
  }) => Promise<BlockGraphSnapshot>
  readonly deleteBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly blockId: string
  }) => Promise<BlockGraphSnapshot>
}

export function registerBlockGraphIpcHandlers(input: BlockGraphIpcHandlersInput): void {
  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly sourceBlockId: string
      readonly targetBlockId: string
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:connect-terminal-blocks',
    handler: (command) => input.connectTerminalBlocks(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'connectTerminalBlocks',
    scope: 'block-graph',
    successLogLevel: 'info'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly connectionId: string
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:disconnect-terminal-blocks',
    handler: (command) => input.disconnectTerminalBlocks(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'disconnectTerminalBlocks',
    scope: 'block-graph',
    successLogLevel: 'info'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly name: string
      readonly description: string
      readonly position: { readonly x: number; readonly y: number }
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:create-terminal-block',
    handler: (command) => input.createTerminalBlock(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'createTerminalBlock',
    scope: 'block-graph',
    successLogLevel: 'info'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly name: string
      readonly memberBlockIds: readonly string[]
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:create-terminal-group',
    handler: (command) => input.createTerminalGroup(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'createTerminalGroup',
    scope: 'block-graph',
    successLogLevel: 'info'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly blockId: string
      readonly position: { readonly x: number; readonly y: number }
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:move-block',
    handler: (command) => input.moveBlock(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'moveBlock',
    scope: 'block-graph'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly terminalGroupId: string
      readonly position: { readonly x: number; readonly y: number }
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:move-terminal-group',
    handler: (command) => input.moveTerminalGroup(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'moveTerminalGroup',
    scope: 'block-graph'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly blockId: string
      readonly name: string
      readonly description: string
      readonly launchCommand: string
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:update-terminal-block-metadata',
    handler: (command) => input.updateTerminalBlockMetadata(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'updateTerminalBlockMetadata',
    scope: 'block-graph'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly blockId: string
      readonly executionConfig: TerminalExecutionConfigSnapshot
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:update-terminal-execution-config',
    handler: (command) => input.updateTerminalExecutionConfig(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'updateTerminalExecutionConfig',
    scope: 'block-graph'
  })

  registerIpcHandler<unknown, BlockGraphSnapshot>({
    channel: 'cleancode:update-terminal-definition',
    handler: (command) => input.updateTerminalDefinition(readTerminalDefinitionCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'updateTerminalDefinition',
    scope: 'block-graph'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly terminalGroupId: string
      readonly name: string
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:update-terminal-group-metadata',
    handler: (command) => input.updateTerminalGroupMetadata(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'updateTerminalGroupMetadata',
    scope: 'block-graph'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly terminalGroupId: string
      readonly isCollapsed: boolean
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:set-terminal-group-collapsed',
    handler: (command) => input.setTerminalGroupCollapsed(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'setTerminalGroupCollapsed',
    scope: 'block-graph'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly terminalGroupId: string
      readonly blockId: string
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:add-terminal-to-group',
    handler: (command) => input.addTerminalToGroup(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'addTerminalToGroup',
    scope: 'block-graph'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly terminalGroupId: string
      readonly blockId: string
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:remove-terminal-from-group',
    handler: (command) => input.removeTerminalFromGroup(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'removeTerminalFromGroup',
    scope: 'block-graph'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly terminalGroupId: string
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:dissolve-terminal-group',
    handler: (command) => input.dissolveTerminalGroup(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'dissolveTerminalGroup',
    scope: 'block-graph',
    successLogLevel: 'info'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly blockId: string
      readonly position: { readonly x: number; readonly y: number }
      readonly size: { readonly width: number; readonly height: number }
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:resize-terminal-block',
    handler: (command) => input.resizeTerminalBlock(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'resizeTerminalBlock',
    scope: 'block-graph'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly viewport: CanvasViewportSnapshot
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:update-graph-viewport',
    handler: (command) => input.updateGraphViewport(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'updateGraphViewport',
    scope: 'block-graph'
  })

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceId: string
      readonly blockId: string
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:delete-block',
    handler: (command) => input.deleteBlock(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'deleteBlock',
    scope: 'block-graph',
    successLogLevel: 'info'
  })
}

function readTerminalDefinitionCommand(command: unknown): TerminalDefinitionIpcCommand {
  if (
    !isRecord(command) ||
    typeof command.projectDirectory !== 'string' ||
    typeof command.workspaceId !== 'string' ||
    typeof command.blockId !== 'string' ||
    typeof command.name !== 'string' ||
    typeof command.description !== 'string' ||
    typeof command.launchCommand !== 'string' ||
    !isRecord(command.executionConfig)
  ) {
    throw createExpectedAppError(
      'INVALID_IPC_COMMAND',
      'Invalid IPC command: complete terminal definition is required.'
    )
  }

  return command as unknown as TerminalDefinitionIpcCommand
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
