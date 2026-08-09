import {
  createExpectedAppError,
  isAppError,
  type AppError
} from '../../../../shared-kernel/application/errors/AppError'

export function getProviderErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createProviderUnavailableError(message: string) {
  return createExpectedAppError('TERMINAL_PROVIDER_UNAVAILABLE', message)
}

export function isRuntimeInvalidatingProviderError(error: unknown): error is AppError {
  return (
    isAppError(error) &&
    (error.code === 'TERMINAL_PROVIDER_UNAVAILABLE' || error.code === 'COMMAND_TIMED_OUT')
  )
}
