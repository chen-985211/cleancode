import type {
  BlockGraphSnapshot,
  CanvasViewportSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import { registerIpcHandler } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'

export interface BlockGraphIpcHandlersInput {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly createTerminalBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly name: string
    readonly description: string
    readonly position: { readonly x: number; readonly y: number }
  }) => Promise<BlockGraphSnapshot>
  readonly moveBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly blockId: string
    readonly position: { readonly x: number; readonly y: number }
  }) => Promise<BlockGraphSnapshot>
  readonly updateTerminalBlockMetadata: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly blockId: string
    readonly name: string
    readonly description: string
  }) => Promise<BlockGraphSnapshot>
  readonly resizeTerminalBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly blockId: string
    readonly size: { readonly width: number; readonly height: number }
  }) => Promise<BlockGraphSnapshot>
  readonly updateGraphViewport: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly viewport: CanvasViewportSnapshot
  }) => Promise<BlockGraphSnapshot>
  readonly deleteBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly blockId: string
  }) => Promise<BlockGraphSnapshot>
  readonly saveGraph: (command: {
    readonly projectDirectory: string
    readonly graph: BlockGraphSnapshot
  }) => Promise<BlockGraphSnapshot>
}

export function registerBlockGraphIpcHandlers(input: BlockGraphIpcHandlersInput): void {
  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly workspaceName: string
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
      readonly workspaceName: string
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
      readonly workspaceName: string
      readonly blockId: string
      readonly name: string
      readonly description: string
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
      readonly workspaceName: string
      readonly blockId: string
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
      readonly workspaceName: string
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
      readonly workspaceName: string
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

  registerIpcHandler<
    {
      readonly projectDirectory: string
      readonly graph: BlockGraphSnapshot
    },
    BlockGraphSnapshot
  >({
    channel: 'cleancode:save-graph',
    handler: (command) => input.saveGraph(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'saveGraph',
    scope: 'block-graph'
  })
}
