import { getAppErrorCode } from '../../shared-kernel/application/errors/AppError'

const terminalViewAttachRetryDelaysMs = [50, 100, 250, 500] as const
const terminalViewRestoreRetryDelaysMs = [0, 25, 50, 100, 250, 500, 1_000] as const

export type TerminalViewRestoreResult = 'abandoned' | 'exhausted' | 'ready'

export async function attachTerminalViewWithRetry<T>(input: {
  readonly attach: () => Promise<T>
  readonly isCancelled: () => boolean
  readonly onStale?: () => void
}): Promise<T | null> {
  for (let attempt = 0; ; attempt += 1) {
    if (input.isCancelled()) return null

    try {
      return await input.attach()
    } catch (error) {
      if (isStaleTerminalViewIdentityError(error)) {
        if (!input.isCancelled()) input.onStale?.()
        return null
      }
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

export async function restoreTerminalViewWithRetry<T>(input: {
  readonly loadSnapshot: () => Promise<T | null>
  readonly restore: (snapshot: T) => Promise<'ready' | 'retry'>
  readonly isCancelled: () => boolean
}): Promise<TerminalViewRestoreResult> {
  for (let attempt = 0; ; attempt += 1) {
    if (input.isCancelled()) return 'abandoned'

    const snapshot = await input.loadSnapshot()
    if (input.isCancelled() || !snapshot) return 'abandoned'

    const result = await input.restore(snapshot)
    if (input.isCancelled()) return 'abandoned'
    if (result === 'ready') return 'ready'

    const retryDelay = terminalViewRestoreRetryDelaysMs[attempt]
    if (retryDelay === undefined) return 'exhausted'
    if (retryDelay > 0) await new Promise((resolve) => setTimeout(resolve, retryDelay))
  }
}

function isTransientTerminalViewAttachError(error: unknown): boolean {
  const code = getAppErrorCode(error)

  if (
    code === 'TERMINAL_MODEL_NOT_FOUND' ||
    code === 'TERMINAL_RUNTIME_NOT_READY' ||
    code === 'TERMINAL_SESSION_NOT_FOUND'
  ) {
    return true
  }

  const message = error instanceof Error ? error.message : String(error)

  return (
    message.includes('TERMINAL_RUNTIME_NOT_READY') ||
    message.includes('Terminal runtime is still starting.')
  )
}

function isStaleTerminalViewIdentityError(error: unknown): boolean {
  if (getAppErrorCode(error) === 'RUN_SCOPE_STALE') return true

  const message = error instanceof Error ? error.message : String(error)

  return (
    message.includes('RUN_SCOPE_STALE') ||
    message.includes('Terminal view no longer matches the current runtime scope.')
  )
}
