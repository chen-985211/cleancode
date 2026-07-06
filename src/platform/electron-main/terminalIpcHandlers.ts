import type { TerminalSessionSnapshot } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type {
  TerminalExitEvent,
  TerminalOutputEvent
} from '../../contexts/run/application/ports/TerminalProcessPort'
import { createExpectedAppError } from '../../shared-kernel/application/errors/AppError'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import { registerIpcHandler } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'

interface IpcSender {
  isDestroyed(): boolean
  send(channel: string, event: unknown): void
}

export interface TerminalIpcHandlersInput {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly startTerminal: (command: {
    readonly terminalBlockId: string
    readonly workspaceName: string
    readonly workingDirectory: string
    readonly shell?: string
    readonly columns?: number
    readonly rows?: number
    readonly onOutput: (event: TerminalOutputEvent) => void
    readonly onExit: (event: TerminalExitEvent) => void
  }) => Promise<TerminalSessionSnapshot>
  readonly resizeTerminal: (sessionId: string, columns: number, rows: number) => void
  readonly writeTerminal: (sessionId: string, input: string) => TerminalSessionSnapshot
  readonly interruptTerminal: (sessionId: string) => TerminalSessionSnapshot
  readonly terminateTerminal: (sessionId: string) => TerminalSessionSnapshot
}

export function registerTerminalIpcHandlers(input: TerminalIpcHandlersInput): void {
  registerIpcHandler<
    {
      readonly terminalBlockId: string
      readonly workspaceName: string
      readonly workingDirectory: string
      readonly shell?: string
      readonly columns?: number
      readonly rows?: number
    },
    TerminalSessionSnapshot
  >({
    channel: 'cleancode:start-terminal',
    handler: (command, event) => {
      const sender = readIpcSender(event)

      return input.startTerminal({
        terminalBlockId: command.terminalBlockId,
        workspaceName: command.workspaceName,
        workingDirectory: command.workingDirectory,
        shell: command.shell,
        columns: command.columns,
        rows: command.rows,
        onOutput: (outputEvent) => {
          if (!sender.isDestroyed()) {
            sender.send('cleancode:terminal-output', outputEvent)
          }
        },
        onExit: (exitEvent) => {
          if (!sender.isDestroyed()) {
            sender.send('cleancode:terminal-exit', exitEvent)
          }
        }
      })
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'startTerminal',
    scope: 'run.terminal'
  })

  registerIpcHandler<
    { readonly sessionId: string; readonly columns: number; readonly rows: number },
    void
  >({
    channel: 'cleancode:resize-terminal',
    handler: (command) => {
      input.resizeTerminal(command.sessionId, command.columns, command.rows)
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'resizeTerminal',
    scope: 'run.terminal'
  })

  registerIpcHandler<
    { readonly sessionId: string; readonly input: string },
    TerminalSessionSnapshot
  >({
    channel: 'cleancode:write-terminal',
    handler: (command) => input.writeTerminal(command.sessionId, command.input),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'writeTerminal',
    scope: 'run.terminal'
  })

  registerIpcHandler<{ readonly sessionId: string }, TerminalSessionSnapshot>({
    channel: 'cleancode:interrupt-terminal',
    handler: (command) => input.interruptTerminal(command.sessionId),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'interruptTerminal',
    scope: 'run.terminal'
  })

  registerIpcHandler<{ readonly sessionId: string }, TerminalSessionSnapshot>({
    channel: 'cleancode:terminate-terminal',
    handler: (command) => input.terminateTerminal(command.sessionId),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'terminateTerminal',
    scope: 'run.terminal'
  })
}

function readIpcSender(event: unknown): IpcSender {
  if (!isRecord(event) || !isRecord(event.sender)) {
    throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid IPC command: sender is required.')
  }

  const sender = event.sender

  if (typeof sender.isDestroyed !== 'function' || typeof sender.send !== 'function') {
    throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid IPC command: sender is invalid.')
  }

  return sender as unknown as IpcSender
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
