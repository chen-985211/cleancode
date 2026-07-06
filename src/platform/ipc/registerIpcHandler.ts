import {
  createUnexpectedAppError,
  isAppError,
  serializeAppError,
  type SerializedAppError
} from '../../shared-kernel/application/errors/AppError'
import type { Logger } from '../logging/Logger'
import type { LogLevel } from '../logging/Logger'

export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: unknown, command?: unknown) => Promise<IpcInvokeResult<unknown>>
  ): void
}

export type IpcInvokeResult<TResult> =
  | {
      readonly ok: true
      readonly value: TResult
    }
  | {
      readonly ok: false
      readonly error: SerializedAppError
    }

export interface RegisterIpcHandlerInput<TCommand, TResult> {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly channel: string
  readonly scope: string
  readonly operation: string
  readonly successLogLevel?: Extract<LogLevel, 'debug' | 'info'> | 'silent'
  readonly handler: (
    command: TCommand,
    event: unknown,
    context: { readonly correlationId: string }
  ) => Promise<TResult> | TResult
}

export function registerIpcHandler<TCommand = unknown, TResult = unknown>({
  channel,
  handler,
  ipcMain,
  logger,
  operation,
  scope,
  successLogLevel = 'silent'
}: RegisterIpcHandlerInput<TCommand, TResult>): void {
  ipcMain.handle(channel, async (event, command) => {
    const startedAt = Date.now()
    const correlationId = createCorrelationId(operation)

    try {
      const value = await handler(command as TCommand, event, { correlationId })
      if (successLogLevel !== 'silent') {
        logger[successLogLevel]({
          correlationId,
          durationMs: resolveDurationMs(startedAt),
          operation,
          outcome: 'success',
          scope
        })
      }

      return { ok: true, value }
    } catch (error) {
      const appError = isAppError(error)
        ? error
        : createUnexpectedAppError('Unexpected application error.')
      const serializedError = serializeAppError(appError, { correlationId })
      const logError = resolveLogError(error, serializedError)

      logger[serializedError.isExpected ? 'warn' : 'error']({
        correlationId,
        durationMs: resolveDurationMs(startedAt),
        error: logError,
        operation,
        outcome: 'failure',
        scope
      })

      return { ok: false, error: serializedError }
    }
  })
}

function resolveLogError(error: unknown, serializedError: SerializedAppError) {
  if (serializedError.isExpected) {
    return {
      code: serializedError.code,
      isExpected: true,
      message: serializedError.message
    }
  }

  if (error instanceof Error) {
    return {
      code: serializedError.code,
      isExpected: false,
      message: error.message,
      stack: error.stack
    }
  }

  return {
    code: serializedError.code,
    isExpected: false,
    message: String(error)
  }
}

function resolveDurationMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt)
}

function createCorrelationId(operation: string): string {
  return `${operation}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
