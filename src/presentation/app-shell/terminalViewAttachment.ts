import { getAppErrorCode } from '../../shared-kernel/application/errors/AppError'

const terminalViewAttachRetryDelaysMs = [50, 100, 250, 500] as const

export async function attachTerminalViewWithRetry<T>(input: {
  readonly attach: () => Promise<T>
  readonly isCancelled: () => boolean
}): Promise<T | null> {
  for (let attempt = 0; ; attempt += 1) {
    if (input.isCancelled()) return null

    try {
      return await input.attach()
    } catch (error) {
      const retryDelay = terminalViewAttachRetryDelaysMs[attempt]
      if (
        retryDelay === undefined ||
        !isTransientTerminalViewAttachError(error) ||
        input.isCancelled()
      ) {
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay))
    }
  }
}

function isTransientTerminalViewAttachError(error: unknown): boolean {
  const code = getAppErrorCode(error)

  return (
    code === 'RUN_SCOPE_STALE' ||
    code === 'TERMINAL_MODEL_NOT_FOUND' ||
    code === 'TERMINAL_RUNTIME_NOT_READY' ||
    code === 'TERMINAL_SESSION_NOT_FOUND'
  )
}
