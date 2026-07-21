import type { WorkflowRunSnapshot } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import type {
  StartTerminalWorkflowCommand,
  TerminalWorkflowService,
  TerminalWorkflowScopeCommand
} from '../../contexts/run/application/use-cases/TerminalWorkflowService'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import { registerIpcHandler } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'
import type { TerminalSourceTheme } from '../../contexts/run/domain/aggregates/TerminalSession'

export interface TerminalWorkflowIpcHandlersInput {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly workflowService: Pick<TerminalWorkflowService, 'getActiveRun' | 'start' | 'stop'>
}

type StartTerminalWorkflowIpcCommand = Omit<StartTerminalWorkflowCommand, 'workingDirectory'>

export function registerTerminalWorkflowIpcHandlers(input: TerminalWorkflowIpcHandlersInput): void {
  registerIpcHandler<StartTerminalWorkflowIpcCommand, WorkflowRunSnapshot>({
    channel: 'cleancode:start-terminal-workflow',
    handler: (command) => {
      const startCommand = readStartWorkflowCommand(command)
      return input.workflowService.start({
        ...startCommand,
        workingDirectory: startCommand.workspaceDirectory
      })
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'startTerminalWorkflow',
    scope: 'run.terminal-workflow',
    successLogLevel: 'info'
  })

  registerIpcHandler<TerminalWorkflowScopeCommand, WorkflowRunSnapshot | null>({
    channel: 'cleancode:stop-terminal-workflow',
    handler: (command) => input.workflowService.stop(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'stopTerminalWorkflow',
    scope: 'run.terminal-workflow',
    successLogLevel: 'info'
  })

  registerIpcHandler<TerminalWorkflowScopeCommand, WorkflowRunSnapshot | null>({
    channel: 'cleancode:get-terminal-workflow',
    handler: (command) => input.workflowService.getActiveRun(command),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'getTerminalWorkflow',
    scope: 'run.terminal-workflow'
  })
}

function readStartWorkflowCommand(command: unknown): StartTerminalWorkflowIpcCommand {
  if (
    !isRecord(command) ||
    !isNonEmptyString(command.projectId) ||
    !isNonEmptyString(command.projectDirectory) ||
    !isNonEmptyString(command.workspaceName) ||
    !isNonEmptyString(command.workspaceDirectory) ||
    !(command.gitBranch === null || typeof command.gitBranch === 'string') ||
    !isTerminalSourceTheme(command.terminalSourceTheme) ||
    !isWorkflowScope(command.scope) ||
    !(command.shell === undefined || typeof command.shell === 'string') ||
    !isOptionalPositiveInteger(command.columns) ||
    !isOptionalPositiveInteger(command.rows)
  ) {
    throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid terminal workflow command.')
  }

  return command as unknown as StartTerminalWorkflowIpcCommand
}

function isTerminalSourceTheme(value: unknown): value is TerminalSourceTheme {
  return value === 'dark' || value === 'light'
}

function isWorkflowScope(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.type === 'full' || (value.type === 'from-block' && isNonEmptyString(value.blockId)))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalPositiveInteger(value: unknown): boolean {
  return value === undefined || (Number.isInteger(value) && Number(value) > 0)
}
