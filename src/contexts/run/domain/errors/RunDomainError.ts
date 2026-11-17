import { AppError, type AppErrorDetails } from '../../../../shared-kernel/domain/errors/AppError'

export const runDomainErrorCodes = [
  'TERMINAL_BLOCK_NOT_FOUND',
  'TERMINAL_EXECUTION_CONFIG_INVALID',
  'TERMINAL_FOREGROUND_JOB_INVALID',
  'TERMINAL_OWNER_INVALID',
  'TERMINAL_SESSION_NOT_RUNNING',
  'TERMINAL_SESSION_RETENTION_NOT_ALLOWED',
  'TERMINAL_WORKFLOW_STATE_INVALID'
] as const

export type RunDomainErrorCode = (typeof runDomainErrorCodes)[number]
const codes = new Set<string>(runDomainErrorCodes)

export function isRunDomainErrorCode(code: unknown): code is RunDomainErrorCode {
  return typeof code === 'string' && codes.has(code)
}

export class RunDomainError extends AppError<RunDomainErrorCode> {
  readonly context = 'run'
  constructor(code: RunDomainErrorCode, message: string, details?: AppErrorDetails) {
    super({ code, message, details, isExpected: true })
    this.name = 'RunDomainError'
  }
}

export function createRunDomainError(
  code: RunDomainErrorCode,
  message: string,
  details?: AppErrorDetails
): RunDomainError {
  return new RunDomainError(code, message, details)
}
