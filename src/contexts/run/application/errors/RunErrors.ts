import {
  AppError,
  createExpectedAppError,
  isCommonErrorCode,
  type CommonErrorCode,
  type AppErrorDetails
} from '../../../../shared-kernel/domain/errors/AppError'
import {
  runDomainErrorCodes,
  isRunDomainErrorCode,
  type RunDomainErrorCode
} from '../../domain/errors/RunDomainError'

const runApplicationErrorCodes = [
  'COMMAND_TIMED_OUT',
  'RUN_SCOPE_STALE',
  'RUN_START_BLOCKED',
  'SERVICE_ENDPOINT_NOT_OPENABLE',
  'SERVICE_LISTENER_OWNERSHIP_MISMATCH',
  'SERVICE_LISTENER_OWNERSHIP_UNVERIFIED',
  'SERVICE_PORT_ALLOCATION_EXHAUSTED',
  'SERVICE_PORT_CLEANUP_FAILED',
  'SERVICE_PORT_FIXED_CONFLICT',
  'SERVICE_PORT_MANAGEMENT_UNSUPPORTED',
  'TERMINAL_LINK_NOT_ALLOWED',
  'TERMINAL_LINK_NOT_FOUND',
  'TERMINAL_LINK_NOT_OPENABLE',
  'TERMINAL_MODEL_IDENTITY_MISMATCH',
  'TERMINAL_MODEL_NOT_FOUND',
  'TERMINAL_PROCESS_NOT_FOUND',
  'TERMINAL_PROVIDER_AUTHENTICATION_FAILED',
  'TERMINAL_PROVIDER_CONTROLLER_BUSY',
  'TERMINAL_PROVIDER_IDENTITY_MISMATCH',
  'TERMINAL_PROVIDER_PROTOCOL_UNSUPPORTED',
  'TERMINAL_PROVIDER_UNAVAILABLE',
  'TERMINAL_RECOVERY_DATA_CORRUPTED',
  'TERMINAL_RECOVERY_STORAGE_LIMIT',
  'TERMINAL_RECOVERY_VERSION_UNSUPPORTED',
  'TERMINAL_RUNTIME_NOT_READY',
  'TERMINAL_SESSION_NOT_FOUND',
  'TERMINAL_SHELL_UNSUPPORTED',
  'TERMINAL_WORKFLOW_EMPTY',
  'TERMINAL_WORKFLOW_SCOPE_CONFLICT'
] as const

type RunApplicationErrorCode = (typeof runApplicationErrorCodes)[number]
export const runErrorCodes = [...runDomainErrorCodes, ...runApplicationErrorCodes] as const
export type RunErrorCode = RunDomainErrorCode | RunApplicationErrorCode | CommonErrorCode
const codes = new Set<string>(runApplicationErrorCodes)

export function isRunErrorCode(code: unknown): code is RunErrorCode {
  return (
    isCommonErrorCode(code) ||
    isRunDomainErrorCode(code) ||
    (typeof code === 'string' && codes.has(code))
  )
}

export class RunApplicationError extends AppError<RunApplicationErrorCode | RunDomainErrorCode> {
  readonly context = 'run'
  constructor(
    code: RunApplicationErrorCode | RunDomainErrorCode,
    message: string,
    details?: AppErrorDetails
  ) {
    super({ code, message, details, isExpected: true })
    this.name = 'RunApplicationError'
  }
}

export function createRunError(
  code: RunErrorCode,
  message: string,
  details?: AppErrorDetails
): AppError<RunErrorCode> {
  if (isCommonErrorCode(code)) return createExpectedAppError(code, message, details)
  return new RunApplicationError(code, message, details)
}
