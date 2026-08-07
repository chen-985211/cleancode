import type {
  BlockGraphSnapshot,
  CanvasViewportSnapshot,
  QuickExecutionSlotNumber,
  QuickExecutionTargetSnapshot,
  TerminalExecutionConfigSnapshot
} from '../../contexts/block-graph/application/dto/BlockGraphSnapshot'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import { registerIpcHandler } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'
import {
  readDeleteTerminalScopeCommand,
  type DeleteTerminalScopeIpcCommand
} from './blockGraphDeleteTerminalScopeIpcCommand'
import {
  readCreateTerminalBlockCommand,
  readCreateTerminalGroupCommand,
  readMoveTerminalWorkflowToGroupCommand
} from './blockGraphTerminalContainerIpcCommands'

interface TerminalDefinitionIpcCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly blockId: string
  readonly name: string
  readonly description: string
  readonly launchCommand: string
  readonly executionConfig: TerminalExecutionConfigSnapshot
}

interface BindQuickExecutionSlotIpcCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly number: QuickExecutionSlotNumber
  readonly target: QuickExecutionTargetSnapshot
}

interface AddQuickExecutionTargetIpcCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly target: QuickExecutionTargetSnapshot
}

interface ClearQuickExecutionSlotIpcCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly number: QuickExecutionSlotNumber
}

interface ReorderQuickExecutionSlotsIpcCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly sourceNumber: QuickExecutionSlotNumber
  readonly destinationNumber: QuickExecutionSlotNumber
}

export interface BlockGraphIpcHandlersInput {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly addQuickExecutionTarget: (
    command: AddQuickExecutionTargetIpcCommand
  ) => Promise<BlockGraphSnapshot>
  readonly bindQuickExecutionSlot: (
    command: BindQuickExecutionSlotIpcCommand
  ) => Promise<BlockGraphSnapshot>
  readonly clearQuickExecutionSlot: (
    command: ClearQuickExecutionSlotIpcCommand
  ) => Promise<BlockGraphSnapshot>
  readonly reorderQuickExecutionSlots: (
    command: ReorderQuickExecutionSlotsIpcCommand
  ) => Promise<BlockGraphSnapshot>
  readonly createTerminalBlock: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly name: string
    readonly description: string
    readonly position: { readonly x: number; readonly y: number }
    readonly terminalGroupId?: string
  }) => Promise<BlockGraphSnapshot>
  readonly createTerminalGroup: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly name: string
    readonly position: { readonly x: number; readonly y: number }
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
  readonly moveTerminalWorkflowToGroup: (command: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly blockId: string
    readonly targetTerminalGroupId: string | null
    readonly position: { readonly x: number; readonly y: number }
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
  readonly deleteTerminalScope: (
    command: DeleteTerminalScopeIpcCommand
  ) => Promise<BlockGraphSnapshot>
}

export function registerBlockGraphIpcHandlers(input: BlockGraphIpcHandlersInput): void {
  registerIpcHandler<unknown, BlockGraphSnapshot>({
    channel: 'cleancode:add-quick-execution-target',
    handler: (command) =>
      input.addQuickExecutionTarget(readAddQuickExecutionTargetCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'addQuickExecutionTarget',
    scope: 'block-graph'
  })

  registerIpcHandler<unknown, BlockGraphSnapshot>({
    channel: 'cleancode:bind-quick-execution-slot',
    handler: (command) => input.bindQuickExecutionSlot(readBindQuickExecutionSlotCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'bindQuickExecutionSlot',
    scope: 'block-graph'
  })

  registerIpcHandler<unknown, BlockGraphSnapshot>({
    channel: 'cleancode:clear-quick-execution-slot',
    handler: (command) =>
      input.clearQuickExecutionSlot(readClearQuickExecutionSlotCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'clearQuickExecutionSlot',
    scope: 'block-graph'
  })

  registerIpcHandler<unknown, BlockGraphSnapshot>({
    channel: 'cleancode:reorder-quick-execution-slots',
    handler: (command) =>
      input.reorderQuickExecutionSlots(readReorderQuickExecutionSlotsCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'reorderQuickExecutionSlots',
    scope: 'block-graph'
  })

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

  registerIpcHandler<unknown, BlockGraphSnapshot>({
    channel: 'cleancode:create-terminal-block',
    handler: (command) => input.createTerminalBlock(readCreateTerminalBlockCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'createTerminalBlock',
    scope: 'block-graph',
    successLogLevel: 'info'
  })

  registerIpcHandler<unknown, BlockGraphSnapshot>({
    channel: 'cleancode:create-terminal-group',
    handler: (command) => input.createTerminalGroup(readCreateTerminalGroupCommand(command)),
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

  registerIpcHandler<unknown, BlockGraphSnapshot>({
    channel: 'cleancode:move-terminal-workflow-to-group',
    handler: (command) =>
      input.moveTerminalWorkflowToGroup(readMoveTerminalWorkflowToGroupCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'moveTerminalWorkflowToGroup',
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

  registerIpcHandler<unknown, BlockGraphSnapshot>({
    channel: 'cleancode:delete-terminal-scope',
    handler: (command) => input.deleteTerminalScope(readDeleteTerminalScopeCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'deleteTerminalScope',
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

function readBindQuickExecutionSlotCommand(command: unknown): BindQuickExecutionSlotIpcCommand {
  const scope = readQuickExecutionSlotScope(command)
  if (!isRecord(command) || !isQuickExecutionTarget(command.target)) {
    throwInvalidQuickExecutionSlotCommand()
  }

  return {
    ...scope,
    target: command.target
  }
}

function readAddQuickExecutionTargetCommand(command: unknown): AddQuickExecutionTargetIpcCommand {
  const scope = readQuickExecutionScope(command)
  if (!isRecord(command) || !isQuickExecutionTarget(command.target)) {
    throwInvalidQuickExecutionSlotCommand()
  }

  return {
    ...scope,
    target: command.target
  }
}

function readClearQuickExecutionSlotCommand(command: unknown): ClearQuickExecutionSlotIpcCommand {
  return readQuickExecutionSlotScope(command)
}

function readQuickExecutionSlotScope(command: unknown): ClearQuickExecutionSlotIpcCommand {
  const scope = readQuickExecutionScope(command)
  if (!isRecord(command) || ![1, 2, 3, 4, 5].includes(command.number as number)) {
    throwInvalidQuickExecutionSlotCommand()
  }

  return {
    ...scope,
    number: command.number as QuickExecutionSlotNumber
  }
}

function readReorderQuickExecutionSlotsCommand(
  command: unknown
): ReorderQuickExecutionSlotsIpcCommand {
  const scope = readQuickExecutionScope(command)
  if (
    !isRecord(command) ||
    ![1, 2, 3, 4, 5].includes(command.sourceNumber as number) ||
    ![1, 2, 3, 4, 5].includes(command.destinationNumber as number)
  ) {
    throwInvalidQuickExecutionSlotCommand()
  }

  return {
    ...scope,
    destinationNumber: command.destinationNumber as QuickExecutionSlotNumber,
    sourceNumber: command.sourceNumber as QuickExecutionSlotNumber
  }
}

function readQuickExecutionScope(command: unknown): {
  readonly projectDirectory: string
  readonly workspaceId: string
} {
  if (
    !isRecord(command) ||
    typeof command.projectDirectory !== 'string' ||
    command.projectDirectory.length === 0 ||
    typeof command.workspaceId !== 'string' ||
    command.workspaceId.length === 0
  ) {
    throwInvalidQuickExecutionSlotCommand()
  }

  return {
    projectDirectory: command.projectDirectory,
    workspaceId: command.workspaceId
  }
}

function isQuickExecutionTarget(value: unknown): value is QuickExecutionTargetSnapshot {
  if (!isRecord(value)) return false
  if (value.type === 'terminal') {
    return (
      hasExactKeys(value, ['type', 'terminalBlockId']) &&
      typeof value.terminalBlockId === 'string' &&
      value.terminalBlockId.length > 0
    )
  }
  if (value.type === 'workflow') {
    return (
      hasExactKeys(value, ['type', 'terminalBlockIds']) &&
      Array.isArray(value.terminalBlockIds) &&
      value.terminalBlockIds.length > 0 &&
      value.terminalBlockIds.every(
        (terminalBlockId) => typeof terminalBlockId === 'string' && terminalBlockId.length > 0
      ) &&
      new Set(value.terminalBlockIds).size === value.terminalBlockIds.length
    )
  }
  return (
    value.type === 'combination' &&
    hasExactKeys(value, ['type', 'terminalGroupId']) &&
    typeof value.terminalGroupId === 'string' &&
    value.terminalGroupId.length > 0
  )
}

function throwInvalidQuickExecutionSlotCommand(): never {
  throw createExpectedAppError(
    'INVALID_IPC_COMMAND',
    'Invalid IPC command: quick execution slot command is required.'
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
