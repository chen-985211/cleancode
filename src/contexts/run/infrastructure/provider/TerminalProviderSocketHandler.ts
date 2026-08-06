import type { Socket } from 'node:net'

import {
  createExpectedAppError,
  createUnexpectedAppError,
  isAppError,
  serializeAppError
} from '../../../../shared-kernel/application/errors/AppError'
import {
  TerminalProviderFrameDecoder,
  type TerminalProviderRequest,
  terminalProviderDefaultRequestDeadlineMs
} from './TerminalProviderProtocol'
import { TerminalProviderRequestScheduler } from './TerminalProviderRequestScheduler'
import {
  authenticateTerminalProviderRequest,
  authorizeTerminalProviderController,
  getErrorMessage,
  isTerminalProviderRequest,
  sendTerminalProviderMessage
} from './TerminalProviderServerSupport'
import type { ProviderControllerState } from './TerminalProviderServerTypes'

interface TerminalProviderSocketHandlerOptions {
  readonly authToken: string
  readonly dispatch: (method: string, params: unknown, socket: Socket) => Promise<unknown>
  readonly getControllerState: () => ProviderControllerState
  readonly log: (message: string, details?: Readonly<Record<string, unknown>>) => void
  readonly onClose: (detachedCleanly: boolean) => void
  readonly socket: Socket
}

export function attachTerminalProviderSocket(options: TerminalProviderSocketHandlerOptions): void {
  const decoder = new TerminalProviderFrameDecoder()
  const scheduler = new TerminalProviderRequestScheduler()
  const activeRequests = new Map<string, AbortController>()
  let detachedCleanly = false

  options.socket.on('data', (chunk) => {
    try {
      for (const message of decoder.push(chunk)) {
        if (!isTerminalProviderRequest(message)) {
          options.socket.destroy()
          return
        }
        void scheduler
          .schedule(message, async () => {
            detachedCleanly ||= await handleRequest(options, message, activeRequests)
          })
          .catch((error) => {
            options.log('protocol-error', { message: getErrorMessage(error) })
            options.socket.destroy()
          })
      }
    } catch (error) {
      options.log('protocol-error', { message: getErrorMessage(error) })
      options.socket.destroy()
    }
  })
  options.socket.on('close', () => {
    for (const controller of activeRequests.values()) controller.abort()
    activeRequests.clear()
    options.onClose(detachedCleanly)
  })
  options.socket.on('error', (error) => options.log('socket-error', { message: error.message }))
}

export function withTerminalProviderOperationDeadline<T>(
  operation: Promise<T>,
  deadlineMs: number
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(providerRequestDeadlineExceeded()), deadlineMs)
    timeout.unref()
  })
  return Promise.race([operation, deadline]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

async function handleRequest(
  options: TerminalProviderSocketHandlerOptions,
  request: TerminalProviderRequest,
  activeRequests: Map<string, AbortController>
): Promise<boolean> {
  const startedAt = performance.now()
  const controller = new AbortController()
  activeRequests.set(request.requestId, controller)
  const deadlineMs = Math.min(
    terminalProviderDefaultRequestDeadlineMs,
    request.deadlineMs ?? terminalProviderDefaultRequestDeadlineMs
  )
  const deadline = setTimeout(() => controller.abort(), deadlineMs)
  deadline.unref()
  try {
    authenticateTerminalProviderRequest(request, options.authToken)
    authorizeTerminalProviderController(options.socket, request, options.getControllerState())
    const result = await raceRequestDeadline(
      options.dispatch(request.method, request.params, options.socket),
      controller.signal
    )
    sendTerminalProviderMessage(options.socket, {
      type: 'response',
      requestId: request.requestId,
      ok: true,
      result
    })
    logSlowRequest(options, request, startedAt)
    if (request.method === 'detachApplication' || request.method === 'awaitApplicationDetach') {
      setTimeout(() => options.socket.end(), 0)
      return true
    }
  } catch (error) {
    const appError = isAppError(error) ? error : createUnexpectedAppError(getErrorMessage(error))
    options.log('request-failed', {
      code: appError.code,
      durationMs: Math.round(performance.now() - startedAt),
      method: request.method,
      requestId: request.requestId
    })
    sendTerminalProviderMessage(options.socket, {
      type: 'response',
      requestId: request.requestId,
      ok: false,
      error: serializeAppError(appError)
    })
  } finally {
    clearTimeout(deadline)
    activeRequests.delete(request.requestId)
  }
  return false
}

function raceRequestDeadline<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(providerRequestDeadlineExceeded())
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(providerRequestDeadlineExceeded())
    signal.addEventListener('abort', abort, { once: true })
    void operation.then(
      (value) => {
        signal.removeEventListener('abort', abort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort)
        reject(error)
      }
    )
  })
}

function logSlowRequest(
  options: TerminalProviderSocketHandlerOptions,
  request: TerminalProviderRequest,
  startedAt: number
): void {
  const durationMs = Math.round(performance.now() - startedAt)
  if (durationMs < 500) return
  options.log('request-slow', { durationMs, method: request.method, requestId: request.requestId })
}

function providerRequestDeadlineExceeded() {
  return createExpectedAppError(
    'COMMAND_TIMED_OUT',
    'Terminal provider request exceeded its deadline.'
  )
}
