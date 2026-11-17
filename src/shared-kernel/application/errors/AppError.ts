import {
  AppError,
  isAppError,
  isAppErrorCode,
  type AppErrorCode,
  type CreateAppErrorInput as DomainAppErrorInput
} from '../../domain/errors/AppError'

export {
  AppError,
  createExpectedAppError,
  createUnexpectedAppError,
  isAppError,
  type AppErrorCode,
  type AppErrorDetails
} from '../../domain/errors/AppError'

export type SerializedAppError = DomainAppErrorInput

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
