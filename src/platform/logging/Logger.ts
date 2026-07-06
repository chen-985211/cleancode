import type { AppErrorCode, AppErrorDetails } from '../../shared-kernel/application/errors/AppError'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEvent {
  readonly timestamp: string
  readonly level: LogLevel
  readonly scope: string
  readonly operation: string
  readonly outcome?: 'success' | 'failure'
  readonly durationMs?: number
  readonly correlationId?: string
  readonly details?: AppErrorDetails
  readonly error?: {
    readonly code?: AppErrorCode
    readonly isExpected?: boolean
    readonly message: string
    readonly stack?: string
  }
}

type LogEventInput = Omit<LogEvent, 'level' | 'timestamp'>

export interface Logger {
  debug(event: LogEventInput): void
  info(event: LogEventInput): void
  warn(event: LogEventInput): void
  error(event: LogEventInput): void
}
