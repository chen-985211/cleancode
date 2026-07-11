const appErrorCodes = [
  'AGENT_TOOL_UNAVAILABLE',
  'AGENT_SESSION_NOT_FOUND',
  'AGENT_SESSION_INVALID',
  'AGENT_TASK_PLAN_INVALID',
  'AGENT_TASK_PLANNING_FAILED',
  'BLOCK_GRAPH_NOT_FOUND',
  'BLOCK_GRAPH_SNAPSHOT_CORRUPTED',
  'BRANCH_WORKSPACE_ALREADY_EXISTS',
  'BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES',
  'BRANCH_WORKSPACE_NOT_FOUND',
  'GIT_BRANCH_ALREADY_EXISTS',
  'GIT_BRANCH_CHECKED_OUT_IN_WORKTREE',
  'GIT_BRANCH_NOT_FOUND',
  'GIT_BRANCH_IS_ALREADY_BOUND_TO_WORKSPACE',
  'GIT_REPOSITORY_HAS_NO_CURRENT_BRANCH',
  'INVALID_CLEANCODE_PROJECT_METADATA',
  'INVALID_CLEANCODE_PROJECT_REGISTRY',
  'INVALID_IPC_COMMAND',
  'MAIN_WORKSPACE_CANNOT_BE_ARCHIVED',
  'MAIN_WORKSPACE_HAS_UNCOMMITTED_CHANGES',
  'NOT_GIT_REPOSITORY',
  'ONLY_GIT_WORKTREE_WORKSPACES_CAN_BE_ARCHIVED',
  'PROJECT_HAS_NO_CURRENT_WORKSPACE',
  'PROJECT_NOT_FOUND',
  'TERMINAL_BLOCK_NAME_EMPTY',
  'TERMINAL_BLOCK_ALREADY_GROUPED',
  'TERMINAL_BLOCK_NOT_FOUND',
  'TERMINAL_GROUP_NAME_EMPTY',
  'TERMINAL_GROUP_NOT_FOUND',
  'TERMINAL_GROUP_REQUIRES_TWO_MEMBERS',
  'TERMINAL_PROCESS_NOT_FOUND',
  'TERMINAL_SESSION_NOT_FOUND',
  'TERMINAL_SESSION_NOT_RUNNING',
  'UNEXPECTED_ERROR'
] as const

export type AppErrorCode = (typeof appErrorCodes)[number]

type AppErrorDetailValue = string | number | boolean | null

export type AppErrorDetails = Readonly<Record<string, AppErrorDetailValue>>

export interface SerializedAppError {
  readonly code: AppErrorCode
  readonly message: string
  readonly isExpected: boolean
  readonly details?: AppErrorDetails
  readonly correlationId?: string
}

export interface CreateAppErrorInput {
  readonly code: AppErrorCode
  readonly message: string
  readonly isExpected: boolean
  readonly details?: AppErrorDetails
  readonly correlationId?: string
}

const registeredErrorCodes = new Set<string>(appErrorCodes)

export class AppError extends Error {
  readonly code: AppErrorCode
  readonly isExpected: boolean
  readonly details?: AppErrorDetails
  readonly correlationId?: string

  constructor(input: CreateAppErrorInput) {
    super(input.message)
    this.name = 'AppError'
    this.code = input.code
    this.isExpected = input.isExpected
    this.details = input.details
    this.correlationId = input.correlationId
  }
}

export function createExpectedAppError(
  code: AppErrorCode,
  message: string,
  details?: AppErrorDetails
): AppError {
  return new AppError({ code, details, isExpected: true, message })
}

export function createUnexpectedAppError(
  message = 'Unexpected application error.',
  details?: AppErrorDetails
): AppError {
  return new AppError({
    code: 'UNEXPECTED_ERROR',
    details,
    isExpected: false,
    message
  })
}

export function createClientAppError(error: SerializedAppError): AppError {
  return new AppError(error)
}

export function serializeAppError(
  error: AppError,
  input: { readonly correlationId?: string } = {}
): SerializedAppError {
  return {
    code: error.code,
    correlationId: input.correlationId ?? error.correlationId,
    details: error.details,
    isExpected: error.isExpected,
    message: error.message
  }
}

export function isAppError(error: unknown): error is AppError {
  return (
    error instanceof Error &&
    isRecord(error) &&
    typeof error.code === 'string' &&
    isAppErrorCode(error.code) &&
    typeof error.isExpected === 'boolean'
  )
}

export function isSerializedAppError(error: unknown): error is SerializedAppError {
  return (
    isRecord(error) &&
    typeof error.code === 'string' &&
    isAppErrorCode(error.code) &&
    typeof error.message === 'string' &&
    typeof error.isExpected === 'boolean' &&
    (error.correlationId === undefined || typeof error.correlationId === 'string')
  )
}

export function getAppErrorCode(error: unknown): AppErrorCode | null {
  if (isAppError(error) || isSerializedAppError(error)) {
    return error.code
  }

  return null
}

function isAppErrorCode(code: string): code is AppErrorCode {
  return registeredErrorCodes.has(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
