import type { WorkflowRunSnapshot } from '../../contexts/run/application/dto/WorkflowRunSnapshot'
import type {
  StartTerminalWorkflowCommand,
  TerminalWorkflowService,
  TerminalWorkflowScopeCommand
} from '../../contexts/run/application/use-cases/TerminalWorkflowService'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import { registerIpcHandler } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'

export interface TerminalWorkflowIpcHandlersInput {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly workflowService: Pick<TerminalWorkflowService, 'getActiveRun' | 'start' | 'stop'>
}

export function registerTerminalWorkflowIpcHandlers(input: TerminalWorkflowIpcHandlersInput): void {
  registerIpcHandler<StartTerminalWorkflowCommand, WorkflowRunSnapshot>({
    channel: 'cleancode:start-terminal-workflow',
    handler: (command) => input.workflowService.start(command),
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
