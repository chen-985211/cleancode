const appErrorCodes = [
  'AGENT_CREATION_CONFLICT',
  'AGENT_PROVIDER_ARGUMENTS_INVALID',
  'AGENT_PROVIDER_DISABLED',
  'AGENT_TOOL_UNAVAILABLE',
  'AGENT_PROVIDER_DUPLICATE',
  'AGENT_PROVIDER_INVALID',
  'AGENT_PROVIDER_MISMATCH',
  'AGENT_PROVIDER_NOT_FOUND',
  'AGENT_PROVIDER_UNAVAILABLE',
  'AGENT_SESSION_NOT_FOUND',
  'AGENT_SESSION_INVALID',
  'AGENT_TASK_PLAN_INVALID',
  'AGENT_TASK_PLANNING_FAILED',
  'AGENT_TOOL_INPUT_INVALID',
  'AGENT_WORKSPACE_SCOPE_STALE',
  'BLOCK_GRAPH_NOT_FOUND',
  'BLOCK_GRAPH_SNAPSHOT_CORRUPTED',
  'BLOCK_GRAPH_SNAPSHOT_VERSION_UNSUPPORTED',
  'BLOCK_TEMPLATE_ALREADY_EXISTS',
  'BLOCK_TEMPLATE_INVALID',
  'BLOCK_TEMPLATE_NOT_FOUND',
  'BLOCK_TEMPLATE_PROJECT_SCOPE_INVALID',
  'BLOCK_TEMPLATE_VERSION_UNSUPPORTED',
  'BRANCH_WORKSPACE_ALREADY_EXISTS',
  'BRANCH_WORKSPACE_HAS_UNCOMMITTED_CHANGES',
  'BRANCH_WORKSPACE_NOT_FOUND',
  'COMMAND_TIMED_OUT',
  'CANVAS_ARRANGEMENT_CORRUPTED',
  'CANVAS_ARRANGEMENT_INVALID',
  'CANVAS_ARRANGEMENT_SCOPE_MISMATCH',
  'CANVAS_ARRANGEMENT_VERSION_UNSUPPORTED',
  'CANVAS_STACK_NOT_FOUND',
  'GIT_BRANCH_ALREADY_EXISTS',
  'GIT_BRANCH_CHECKED_OUT_IN_WORKTREE',
  'GIT_BRANCH_NOT_FOUND',
  'GIT_BRANCH_IS_ALREADY_BOUND_TO_WORKSPACE',
  'GIT_REPOSITORY_HAS_NO_CURRENT_BRANCH',
  'GIT_WORKTREE_LOCKED',
  'INVALID_CANVAS_OBJECT_IDENTITY',
  'INVALID_CLEANCODE_PROJECT_METADATA',
  'INVALID_CLEANCODE_PROJECT_REGISTRY',
  'INVALID_IPC_COMMAND',
  'MAIN_WORKSPACE_CANNOT_BE_ARCHIVED',
  'MAIN_WORKSPACE_HAS_UNCOMMITTED_CHANGES',
  'NOT_GIT_REPOSITORY',
  'ONLY_GIT_WORKTREE_WORKSPACES_CAN_BE_ARCHIVED',
  'PROJECT_HAS_NO_CURRENT_WORKSPACE',
  'PROJECT_NOT_FOUND',
  'PROJECT_NOT_REMEMBERED',
  'QUICK_EXECUTION_BAR_FULL',
  'QUICK_EXECUTION_SLOT_INVALID',
  'QUICK_EXECUTION_TARGET_INVALID',
  'QUICK_EXECUTION_TARGET_NOT_FOUND',
  'RUN_SCOPE_STALE',
  'RUN_START_BLOCKED',
  'SERVICE_ENDPOINT_NOT_OPENABLE',
  'SERVICE_LISTENER_OWNERSHIP_MISMATCH',
  'SERVICE_LISTENER_OWNERSHIP_UNVERIFIED',
  'SERVICE_PORT_ALLOCATION_EXHAUSTED',
  'SERVICE_PORT_CLEANUP_FAILED',
  'SERVICE_PORT_FIXED_CONFLICT',
  'SERVICE_PORT_MANAGEMENT_UNSUPPORTED',
  'TERMINAL_BLOCK_NAME_EMPTY',
  'TERMINAL_BLOCK_ALREADY_GROUPED',
  'TERMINAL_BLOCK_NOT_IN_GROUP',
  'TERMINAL_BLOCK_NOT_FOUND',
  'TERMINAL_CONNECTION_DUPLICATE',
  'TERMINAL_CONNECTION_INVALID',
  'TERMINAL_CONNECTION_NOT_FOUND',
  'TERMINAL_CONNECTION_SCOPE_MISMATCH',
  'TERMINAL_EXECUTION_CONFIG_INVALID',
  'TERMINAL_FOREGROUND_JOB_INVALID',
  'TERMINAL_GROUP_NAME_EMPTY',
  'TERMINAL_GROUP_LAYOUT_CONFLICT',
  'TERMINAL_GROUP_NOT_FOUND',
  'TERMINAL_GROUP_REQUIRES_TWO_MEMBERS',
  'TERMINAL_GROUP_REQUIRES_TWO_EXECUTION_UNITS',
  'TERMINAL_LAYOUT_ANCHOR_REQUIRED',
  'TERMINAL_LAYOUT_PARTIAL_GROUP',
  'TERMINAL_LAYOUT_SCOPE_EMPTY',
  'TERMINAL_LINK_NOT_ALLOWED',
  'TERMINAL_LINK_NOT_FOUND',
  'TERMINAL_LINK_NOT_OPENABLE',
  'TERMINAL_MODEL_IDENTITY_MISMATCH',
  'TERMINAL_MODEL_NOT_FOUND',
  'TERMINAL_OWNER_INVALID',
  'TERMINAL_PROCESS_NOT_FOUND',
  'TERMINAL_PROVIDER_AUTHENTICATION_FAILED',
  'TERMINAL_PROVIDER_CONTROLLER_BUSY',
  'TERMINAL_PROVIDER_IDENTITY_MISMATCH',
  'TERMINAL_PROVIDER_PROTOCOL_UNSUPPORTED',
  'TERMINAL_PROVIDER_UNAVAILABLE',
  'TERMINAL_RECOVERY_DATA_CORRUPTED',
  'TERMINAL_RECOVERY_STORAGE_LIMIT',
  'TERMINAL_RECOVERY_VERSION_UNSUPPORTED',
  'TERMINAL_REMOVAL_SCOPE_STALE',
  'TERMINAL_RUNTIME_NOT_READY',
  'TERMINAL_SESSION_NOT_FOUND',
  'TERMINAL_SESSION_NOT_RUNNING',
  'TERMINAL_SESSION_RETENTION_NOT_ALLOWED',
  'TERMINAL_SHELL_UNSUPPORTED',
  'TERMINAL_SCOPE_MOVE_STALE',
  'TERMINAL_WORKFLOW_CYCLE',
  'TERMINAL_WORKFLOW_COMMAND_MISSING',
  'TERMINAL_WORKFLOW_DEFINITION_INVALID',
  'TERMINAL_WORKFLOW_EMPTY',
  'TERMINAL_WORKFLOW_STATE_INVALID',
  'UNEXPECTED_ERROR',
  'WORKSPACE_EXTERNAL_OPEN_FAILED',
  'WORKSPACE_OPEN_TARGET_UNAVAILABLE'
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
