export const commonErrorCodes = ['INVALID_CANVAS_OBJECT_IDENTITY', 'UNEXPECTED_ERROR'] as const

export type CommonErrorCode = (typeof commonErrorCodes)[number]
export type AppErrorCode = string

type AppErrorDetailValue = string | number | boolean | null

export type AppErrorDetails = Readonly<Record<string, AppErrorDetailValue>>

export interface CreateAppErrorInput<TCode extends string = AppErrorCode> {
  readonly code: TCode
  readonly message: string
  readonly isExpected: boolean
  readonly details?: AppErrorDetails
  readonly correlationId?: string
}

const registeredErrorCodes = new Set<string>(commonErrorCodes)

export class AppError<TCode extends string = AppErrorCode> extends Error {
  readonly code: TCode
  readonly isExpected: boolean
  readonly details?: AppErrorDetails
  readonly correlationId?: string

  constructor(input: CreateAppErrorInput<TCode>) {
    super(input.message)
    this.name = 'AppError'
    this.code = input.code
    this.isExpected = input.isExpected
    this.details = input.details
    this.correlationId = input.correlationId
  }
}

export function createExpectedAppError(
  code: CommonErrorCode,
  message: string,
  details?: AppErrorDetails,
  correlationId?: string
): AppError<CommonErrorCode> {
  return new AppError({ code, details, correlationId, isExpected: true, message })
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

export function isAppError(error: unknown): error is AppError {
  return (
    error instanceof Error &&
    isRecord(error) &&
    typeof error.code === 'string' &&
    isErrorCode(error.code) &&
    typeof error.isExpected === 'boolean'
  )
}

export function isCommonErrorCode(code: unknown): code is CommonErrorCode {
  return typeof code === 'string' && registeredErrorCodes.has(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** An observed failure code is an opaque identifier, not another context's vocabulary. */
export function isErrorCode(code: unknown): code is AppErrorCode {
  return typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code)
}
