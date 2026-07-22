import type { TerminalSessionSnapshot } from '../../contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalRuntimeAvailabilitySnapshot } from '../../contexts/run/application/dto/TerminalRuntimeAvailability'
import type { TerminalRetentionPolicy } from '../../contexts/run/domain/aggregates/TerminalSession'
import type { ActualServiceEndpoint } from '../../contexts/run/domain/value-objects/ActualServiceEndpoint'
import type { TerminalSourceTheme } from '../../contexts/run/domain/aggregates/TerminalSession'
import type {
  OpenTerminalLinkCommand,
  TerminalLinkOpenResult
} from '../../contexts/run/application/dto/TerminalLink'
import type { TerminalSnapshot } from '../../contexts/run/application/dto/TerminalModelSnapshot'
import {
  isTerminalScrollbackRows,
  type TerminalScrollbackRows
} from '../../contexts/run/application/dto/TerminalRuntimeSettings'
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
import {
  createTerminalViewLifecycle,
  type TerminalViewIpcSender,
  type TerminalViewLifecycle
} from './terminalViewLifecycle'

interface IpcSender {
  isDestroyed(): boolean
  send(channel: string, event: unknown): void
}

export interface TerminalIpcHandlersInput {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly getTerminalRuntimeAvailability?: () => TerminalRuntimeAvailabilitySnapshot
  readonly retryTerminalRuntime?: () => Promise<TerminalRuntimeAvailabilitySnapshot>
  readonly startTerminal: (command: {
    readonly projectId: string
    readonly projectDirectory: string
    readonly terminalBlockId: string
    readonly workspaceName: string
    readonly workspaceDirectory: string
    readonly gitBranch: string | null
    readonly workingDirectory: string
    readonly terminalSourceTheme: TerminalSourceTheme
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
    readonly terminalSourceTheme: TerminalSourceTheme
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
  readonly openTerminalLink: (command: OpenTerminalLinkCommand) => Promise<TerminalLinkOpenResult>
  readonly resolveManagedServiceOwner?: ManagedServiceOwnerResolver
  readonly resizeTerminal: (
    sessionId: string,
    columns: number,
    rows: number
  ) => TerminalSessionSnapshot
  readonly writeTerminal: (sessionId: string, input: string) => TerminalSessionSnapshot
  readonly interruptTerminal: (sessionId: string) => TerminalSessionSnapshot
  readonly listTerminalSessions: (sessionIds: readonly string[]) => TerminalSessionSnapshot[]
  readonly listRecoveredTerminalSessions?: () => TerminalSessionSnapshot[]
  readonly listRecoveredTerminalServiceEndpoints?: () => readonly {
    readonly session: TerminalSessionSnapshot
    readonly endpoint: ActualServiceEndpoint
  }[]
  readonly listTerminalWorkingDirectories: (
    sessionIds: readonly string[]
  ) => Promise<TerminalWorkingDirectorySnapshot[]>
  readonly terminateTerminal: (sessionId: string) => Promise<TerminalSessionSnapshot | null>
  readonly updateTerminalScrollback: (rows: TerminalScrollbackRows) => void
  readonly setTerminalRetention?: (
    sessionId: string,
    retentionPolicy: TerminalRetentionPolicy
  ) => Promise<TerminalSessionSnapshot>
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
  readonly terminalSourceTheme: TerminalSourceTheme
  readonly shell?: string
  readonly columns?: number
  readonly rows?: number
}

export function registerTerminalIpcHandlers(
  input: TerminalIpcHandlersInput
): TerminalViewLifecycle {
  const viewLifecycle = createTerminalViewLifecycle({
    detachView: input.detachTerminalView,
    logger: input.logger
  })

  registerIpcHandler<void, TerminalRuntimeAvailabilitySnapshot>({
    channel: 'cleancode:get-terminal-runtime-availability',
    handler: () => input.getTerminalRuntimeAvailability?.() ?? readyRuntimeAvailability,
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'getTerminalRuntimeAvailability',
    scope: 'run.terminal-runtime'
  })

  registerIpcHandler<void, TerminalRuntimeAvailabilitySnapshot>({
    channel: 'cleancode:retry-terminal-runtime',
    handler: () => input.retryTerminalRuntime?.() ?? Promise.resolve(readyRuntimeAvailability),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'retryTerminalRuntime',
    scope: 'run.terminal-runtime'
  })

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
          terminalSourceTheme: launchCommand.terminalSourceTheme,
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

  registerIpcHandler<OpenTerminalLinkCommand, TerminalLinkOpenResult>({
    channel: 'cleancode:open-terminal-link',
    handler: (command) => input.openTerminalLink(readTerminalLinkCommand(command)),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'openTerminalLink',
    scope: 'run.terminal-link'
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

  registerIpcHandler<void, TerminalSessionSnapshot[]>({
    channel: 'cleancode:list-recovered-terminal-sessions',
    handler: () => input.listRecoveredTerminalSessions?.() ?? [],
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'listRecoveredTerminalSessions',
    scope: 'run.terminal-recovery'
  })

  registerIpcHandler<
    void,
    readonly { readonly sessionId: string; readonly endpoint: ActualServiceEndpoint }[]
  >({
    channel: 'cleancode:list-recovered-terminal-service-endpoints',
    handler: () =>
      (input.listRecoveredTerminalServiceEndpoints?.() ?? []).map(({ session, endpoint }) => ({
        sessionId: session.id,
        endpoint
      })),
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'listRecoveredTerminalServiceEndpoints',
    scope: 'run.service-port'
  })

  registerIpcHandler<
    { readonly sessionId: string; readonly retentionPolicy: TerminalRetentionPolicy },
    TerminalSessionSnapshot
  >({
    channel: 'cleancode:set-terminal-retention',
    handler: (command) => {
      if (
        !isRecord(command) ||
        typeof command.sessionId !== 'string' ||
        (command.retentionPolicy !== 'terminate-on-application-exit' &&
          command.retentionPolicy !== 'keep-after-application-exit')
      ) {
        throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid terminal retention command.')
      }
      if (!input.setTerminalRetention) {
        throw createExpectedAppError(
          'TERMINAL_PROVIDER_UNAVAILABLE',
          'Terminal retention is unavailable.'
        )
      }
      return input.setTerminalRetention(command.sessionId, command.retentionPolicy)
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'setTerminalRetention',
    scope: 'run.terminal-recovery'
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
      viewLifecycle.registerView(viewCommand, sender)

      try {
        return await input.attachTerminalView({
          ...viewCommand,
          onOutput: (outputEvent: TerminalViewOutputEvent) =>
            sendRendererEvent(sender, 'cleancode:terminal-view-output', outputEvent)
        })
      } catch (error) {
        viewLifecycle.discardView(viewCommand)
        throw error
      }
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'attachTerminalView',
    scope: 'run.terminal-view'
  })

  registerIpcHandler<{ readonly scrollbackRows: TerminalScrollbackRows }, void>({
    channel: 'cleancode:update-terminal-scrollback',
    handler: (command) => {
      if (!isRecord(command) || !isTerminalScrollbackRows(command.scrollbackRows)) {
        throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid terminal scrollback budget.')
      }
      input.updateTerminalScrollback(command.scrollbackRows)
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'updateTerminalScrollback',
    scope: 'run.terminal-model'
  })

  registerIpcHandler<TerminalViewIdentityCommand, void>({
    channel: 'cleancode:detach-terminal-view',
    handler: async (command) => {
      const viewCommand = readTerminalViewCommand(command)
      await viewLifecycle.releaseView(viewCommand)
    },
    ipcMain: input.ipcMain,
    logger: input.logger,
    operation: 'detachTerminalView',
    scope: 'run.terminal-view'
  })

  return viewLifecycle
}

const readyRuntimeAvailability: TerminalRuntimeAvailabilitySnapshot = {
  phase: 'ready',
  epoch: 1,
  errorCode: null,
  retryable: false
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
  if (
    command.owner !== undefined &&
    (!isRecord(command.owner) ||
      (command.owner.kind !== 'block' && command.owner.kind !== 'agent') ||
      !isNonEmptyString(command.owner.id))
  ) {
    throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid terminal view owner.')
  }
  return command as unknown as TerminalViewIdentityCommand
}

function readTerminalLinkCommand(command: unknown): OpenTerminalLinkCommand {
  const identity = readTerminalViewCommand(command)
  if (
    !isRecord(command) ||
    typeof command.rawTarget !== 'string' ||
    command.rawTarget.trim().length === 0 ||
    command.rawTarget.length > 4_096
  ) {
    throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid terminal link target.')
  }
  return { ...identity, rawTarget: command.rawTarget }
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
    !isTerminalSourceTheme(command.terminalSourceTheme) ||
    !(command.shell === undefined || typeof command.shell === 'string') ||
    !isOptionalPositiveInteger(command.columns) ||
    !isOptionalPositiveInteger(command.rows)
  ) {
    throw createExpectedAppError('INVALID_IPC_COMMAND', 'Invalid terminal start command.')
  }

  return command as unknown as StartTerminalIpcCommand
}

function isTerminalSourceTheme(value: unknown): value is TerminalSourceTheme {
  return value === 'dark' || value === 'light'
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
