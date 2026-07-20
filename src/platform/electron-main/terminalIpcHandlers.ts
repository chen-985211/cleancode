import type { TerminalSessionSnapshot } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalSnapshot } from '../../contexts/run/application/dto/TerminalModelSnapshot'
import type {
  TerminalRunEvent,
  TerminalRunIdentity,
  TerminalServiceEndpoint
} from '../../contexts/run/application/dto/TerminalRunEvent'
import type {
  TerminalExitEvent,
  TerminalOutputEvent,
  TerminalWorkingDirectorySnapshot
} from '../../contexts/run/application/ports/TerminalProcessPort'
import type { TerminalViewOutputEvent } from '../../contexts/run/application/ports/TerminalModelPort'
import type {
  AttachTerminalViewCommand,
  TerminalViewIdentityCommand
} from '../../contexts/run/application/use-cases/TerminalSessionService'
import { createExpectedAppError, isAppError } from '../../shared-kernel/application/errors/AppError'
import type { IpcMainLike } from '../ipc/registerIpcHandler'
import { registerIpcHandler } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'
import type { ManagedServiceOwnerResolver } from './managedServiceOwnerResolver'
import { projectTerminalPortConflict } from './terminalPortConflictProjection'

interface IpcSender {
  isDestroyed(): boolean
  send(channel: string, event: unknown): void
}

interface TerminalViewIpcSender extends IpcSender {
  once(event: 'destroyed', listener: () => void): void
  removeListener(event: 'destroyed', listener: () => void): void
}

export interface TerminalIpcHandlersInput {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly startTerminal: (command: {
    readonly projectId: string
    readonly projectDirectory: string
    readonly terminalBlockId: string
    readonly workspaceName: string
    readonly workspaceDirectory: string
    readonly gitBranch: string | null
    readonly workingDirectory: string
    readonly shell?: string
    readonly columns?: number
    readonly rows?: number
    readonly onOutput: (event: TerminalOutputEvent) => void
    readonly onExit: (event: TerminalExitEvent) => void
  }) => Promise<TerminalSessionSnapshot>
  readonly launchTerminal: (command: {
    readonly projectId: string
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly workspaceDirectory: string
    readonly gitBranch: string | null
    readonly blockId: string
    readonly workingDirectory: string
    readonly shell?: string
    readonly columns?: number
    readonly rows?: number
    readonly signal: AbortSignal
    readonly onOutput: (event: TerminalOutputEvent) => void
    readonly onExit: (event: TerminalExitEvent) => void
    readonly onSessionStarted: (
      session: TerminalSessionSnapshot,
      endpoint: TerminalServiceEndpoint | null
    ) => void
    readonly onEndpointConfirmed: (
      session: TerminalSessionSnapshot,
      endpoint: TerminalServiceEndpoint
    ) => void
    readonly onPortStateChanged?: (
      session: TerminalSessionSnapshot,
      endpoint: TerminalServiceEndpoint,
      state: 'releasing' | 'released' | 'quarantined'
    ) => void
    readonly onRunEnded?: (event: TerminalExitEvent) => void
    readonly onCleanupFailed?: (error: unknown) => void
  }) => Promise<{
    readonly session: TerminalSessionSnapshot
    readonly endpoint: TerminalServiceEndpoint | null
  }>
  readonly openTerminalServiceEndpoint: (command: {
    readonly runId: string
    readonly sessionId: string
    readonly generation: number
  }) => Promise<void>
  readonly resolveManagedServiceOwner?: ManagedServiceOwnerResolver
  readonly resizeTerminal: (
    sessionId: string,
    columns: number,
    rows: number
  ) => TerminalSessionSnapshot
  readonly writeTerminal: (sessionId: string, input: string) => TerminalSessionSnapshot
  readonly interruptTerminal: (sessionId: string) => TerminalSessionSnapshot
  readonly listTerminalSessions: (sessionIds: readonly string[]) => TerminalSessionSnapshot[]
  readonly listTerminalWorkingDirectories: (
    sessionIds: readonly string[]
  ) => Promise<TerminalWorkingDirectorySnapshot[]>
  readonly terminateTerminal: (sessionId: string) => Promise<TerminalSessionSnapshot | null>
  readonly attachTerminalView: (command: AttachTerminalViewCommand) => Promise<TerminalSnapshot>
  readonly detachTerminalView: (command: TerminalViewIdentityCommand) => Promise<void>
}

interface StartTerminalIpcCommand {
  readonly projectId: string
  readonly projectDirectory: string
  readonly terminalBlockId: string
  readonly workspaceName: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly shell?: string
  readonly columns?: number
  readonly rows?: number
}

export function registerTerminalIpcHandlers(input: TerminalIpcHandlersInput): void {
  const viewCleanupListeners = new Map<
    string,
    { readonly sender: TerminalViewIpcSender; readonly listener: () => void }
  >()

  registerIpcHandler<StartTerminalIpcCommand, TerminalSessionSnapshot>({
    channel: 'cleancode:start-terminal',
    handler: (command, event) => {
      const sender = readIpcSender(event)
      const startCommand = readStartTerminalCommand(command)

      return input.startTerminal({
        ...startCommand,
        workingDirectory: startCommand.workspaceDirectory,
        onOutput: () => undefined,
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
    StartTerminalIpcCommand,
    { readonly session: TerminalSessionSnapshot; readonly endpoint: TerminalServiceEndpoint | null }
  >({
    channel: 'cleancode:launch-terminal',
    handler: async (command, event) => {
      const sender = readIpcSender(event)
      const launchCommand = readStartTerminalCommand(command)

      try {
        return await input.launchTerminal({
          projectId: launchCommand.projectId,
          projectDirectory: launchCommand.projectDirectory,
          workspaceName: launchCommand.workspaceName,
          workspaceDirectory: launchCommand.workspaceDirectory,
          gitBranch: launchCommand.gitBranch,
          blockId: launchCommand.terminalBlockId,
          workingDirectory: launchCommand.workspaceDirectory,
          shell: launchCommand.shell,
          columns: launchCommand.columns,
          rows: launchCommand.rows,
          signal: new AbortController().signal,
          onOutput: () => undefined,
          onExit: (exitEvent) => {
            sendRendererEvent(sender, 'cleancode:terminal-exit', exitEvent)
          },
          onRunEnded: (exitEvent) => {
            sendRendererEvent(sender, 'cleancode:terminal-run-event', {
              type: 'service-run-ended',
              scope: toRunIdentity(exitEvent.scope)
            } satisfies TerminalRunEvent)
          },
          onSessionStarted: (session) => {
            sendRendererEvent(sender, 'cleancode:terminal-run-event', {
              type: 'service-run-started',
              scope: toRunIdentity(session)
            } satisfies TerminalRunEvent)
          },
          onEndpointConfirmed: (session, endpoint) => {
            sendRendererEvent(sender, 'cleancode:terminal-run-event', {
              type: 'service-endpoint-updated',
              scope: toRunIdentity(session),
              endpoint
            } satisfies TerminalRunEvent)
          },
          onPortStateChanged: (session, _endpoint, state) => {
            sendRendererEvent(sender, 'cleancode:terminal-run-event', {
              type: 'service-port-state-changed',
              scope: toRunIdentity(session),
              state
            } satisfies TerminalRunEvent)
          },
          onCleanupFailed: (error) => {
            input.logger.warn({
              scope: 'run.service-port',
              operation: 'cleanupManagedTerminalService',
              outcome: 'failure',
              error: isAppError(error)
                ? { code: error.code, isExpected: error.isExpected, message: error.message }
                : { message: error instanceof Error ? error.message : String(error) }
            })
          }
        })
      } catch (error) {
        await publishPortConflict(input, sender, error)
        throw error
      }
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'launchTerminal',
    scope: 'run.terminal',
    successLogLevel: 'info'
  })

  registerIpcHandler<
    { readonly runId: string; readonly sessionId: string; readonly generation: number },
    void
  >({
    channel: 'cleancode:open-terminal-service-endpoint',
    handler: (command) => input.openTerminalServiceEndpoint(readRunIdentityCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'openTerminalServiceEndpoint',
    scope: 'run.terminal'
  })

  registerIpcHandler<
    { readonly sessionId: string; readonly columns: number; readonly rows: number },
    TerminalSessionSnapshot
  >({
    channel: 'cleancode:resize-terminal',
    handler: (command) => input.resizeTerminal(command.sessionId, command.columns, command.rows),
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

  registerIpcHandler<{ readonly sessionIds: readonly string[] }, TerminalSessionSnapshot[]>({
    channel: 'cleancode:list-terminal-sessions',
    handler: (command) => input.listTerminalSessions(readSessionIds(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'listTerminalSessions',
    scope: 'run.terminal'
  })

  registerIpcHandler<
    { readonly sessionIds: readonly string[] },
    TerminalWorkingDirectorySnapshot[]
  >({
    channel: 'cleancode:list-terminal-working-directories',
    handler: (command) => input.listTerminalWorkingDirectories(readSessionIds(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'listTerminalWorkingDirectories',
    scope: 'run.terminal'
  })

  registerIpcHandler<{ readonly sessionId: string }, TerminalSessionSnapshot | null>({
    channel: 'cleancode:terminate-terminal',
    handler: (command) => input.terminateTerminal(command.sessionId),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'terminateTerminal',
    scope: 'run.terminal'
  })

  registerIpcHandler<TerminalViewIdentityCommand, TerminalSnapshot>({
    channel: 'cleancode:attach-terminal-view',
    handler: async (command, event) => {
      const viewCommand = readTerminalViewCommand(command)
      const sender = readTerminalViewIpcSender(event)
      unregisterViewCleanup(viewCleanupListeners, viewCommand.viewId)
      const cleanupListener = () => {
        viewCleanupListeners.delete(viewCommand.viewId)
        void input.detachTerminalView(viewCommand).catch((error) => {
          input.logger.warn({
            scope: 'run.terminal-view',
            operation: 'detachDestroyedTerminalView',
            outcome: 'failure',
            error: { message: error instanceof Error ? error.message : String(error) }
          })
        })
      }
      sender.once('destroyed', cleanupListener)
      viewCleanupListeners.set(viewCommand.viewId, { sender, listener: cleanupListener })

      try {
        return await input.attachTerminalView({
          ...viewCommand,
          onOutput: (outputEvent: TerminalViewOutputEvent) =>
            sendRendererEvent(sender, 'cleancode:terminal-view-output', outputEvent)
        })
      } catch (error) {
        unregisterViewCleanup(viewCleanupListeners, viewCommand.viewId)
        throw error
      }
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'attachTerminalView',
    scope: 'run.terminal-view'
  })

  registerIpcHandler<TerminalViewIdentityCommand, void>({
    channel: 'cleancode:detach-terminal-view',
    handler: async (command) => {
      const viewCommand = readTerminalViewCommand(command)
      try {
        await input.detachTerminalView(viewCommand)
      } finally {
        unregisterViewCleanup(viewCleanupListeners, viewCommand.viewId)
      }
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'detachTerminalView',
    scope: 'run.terminal-view'
  })
}

function sendRendererEvent(sender: IpcSender, channel: string, event: unknown): void {
  if (!sender.isDestroyed()) sender.send(channel, event)
}

function toRunIdentity(scope: {
  readonly projectId: string
  readonly workspaceName: string
  readonly blockId: string
  readonly sessionId: string
  readonly runId: string
  readonly generation: number
}): TerminalRunIdentity {
  return {
    projectId: scope.projectId,
    workspaceName: scope.workspaceName,
    blockId: scope.blockId,
    sessionId: scope.sessionId,
    runId: scope.runId,
    generation: scope.generation
  }
}

async function publishPortConflict(
  input: TerminalIpcHandlersInput,
  sender: IpcSender,
  error: unknown
): Promise<void> {
  if (!isAppError(error)) return
  const event = await projectTerminalPortConflict(
    error,
    input.resolveManagedServiceOwner,
    (resolutionError) => {
      input.logger.warn({
        scope: 'run.terminal',
        operation: 'resolveManagedServiceOwner',
        outcome: 'failure',
        error: {
          message:
            resolutionError instanceof Error ? resolutionError.message : String(resolutionError)
        }
      })
    }
  )
  if (event) sendRendererEvent(sender, 'cleancode:terminal-run-event', event)
}

function readRunIdentityCommand(command: unknown): {
  readonly runId: string
  readonly sessionId: string
  readonly generation: number
} {
  if (
    !isRecord(command) ||
    !isNonEmptyString(command.runId) ||
    !isNonEmptyString(command.sessionId) ||
    !Number.isSafeInteger(command.generation) ||
    Number(command.generation) < 1
  ) {
    throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid terminal run identity.')
  }
  return command as unknown as {
    readonly runId: string
    readonly sessionId: string
    readonly generation: number
  }
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

function readTerminalViewIpcSender(event: unknown): TerminalViewIpcSender {
  const sender = readIpcSender(event)
  const candidate = sender as IpcSender & Partial<TerminalViewIpcSender>
  if (typeof candidate.once !== 'function' || typeof candidate.removeListener !== 'function') {
    throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid terminal view IPC sender.')
  }
  return candidate as TerminalViewIpcSender
}

function unregisterViewCleanup(
  listeners: Map<string, { readonly sender: TerminalViewIpcSender; readonly listener: () => void }>,
  viewId: string
): void {
  const cleanup = listeners.get(viewId)
  if (!cleanup) return
  cleanup.sender.removeListener('destroyed', cleanup.listener)
  listeners.delete(viewId)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readTerminalViewCommand(command: unknown): TerminalViewIdentityCommand {
  if (
    !isRecord(command) ||
    !isNonEmptyString(command.projectId) ||
    !isNonEmptyString(command.workspaceName) ||
    !isNonEmptyString(command.blockId) ||
    !isNonEmptyString(command.sessionId) ||
    !isNonEmptyString(command.runId) ||
    !Number.isSafeInteger(command.generation) ||
    Number(command.generation) < 1 ||
    !isNonEmptyString(command.viewId)
  ) {
    throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid terminal view identity.')
  }
  return command as unknown as TerminalViewIdentityCommand
}

function readStartTerminalCommand(command: unknown): StartTerminalIpcCommand {
  if (
    !isRecord(command) ||
    !isNonEmptyString(command.projectId) ||
    !isNonEmptyString(command.projectDirectory) ||
    !isNonEmptyString(command.terminalBlockId) ||
    !isNonEmptyString(command.workspaceName) ||
    !isNonEmptyString(command.workspaceDirectory) ||
    !(command.gitBranch === null || typeof command.gitBranch === 'string') ||
    !(command.shell === undefined || typeof command.shell === 'string') ||
    !isOptionalPositiveInteger(command.columns) ||
    !isOptionalPositiveInteger(command.rows)
  ) {
    throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid terminal start command.')
  }

  return command as unknown as StartTerminalIpcCommand
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isOptionalPositiveInteger(value: unknown): boolean {
  return value === undefined || (Number.isInteger(value) && Number(value) > 0)
}

function readSessionIds(command: unknown): readonly string[] {
  if (
    !isRecord(command) ||
    !Array.isArray(command.sessionIds) ||
    command.sessionIds.length > 1_000 ||
    !command.sessionIds.every(isNonEmptyString)
  ) {
    throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid terminal session query.')
  }
  return command.sessionIds
}
