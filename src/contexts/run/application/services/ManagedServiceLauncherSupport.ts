import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { ServicePortLease } from '../../domain/services/ServicePortLeaseRegistry'
import type { LocalPortAllocation } from './LocalPortAllocator'
import { createRunAttemptDetails } from './RunFailureDetails'

export async function releaseUnusedAllocation(
  allocation: LocalPortAllocation | null
): Promise<void> {
  if (!allocation) return
  try {
    await allocation.reservation.release()
  } catch (error) {
    markReleasing(allocation.lease)
    quarantineIfReleasing(allocation.lease, getErrorMessage(error))
    throw createExpectedAppError(
      'SERVICE_PORT_CLEANUP_FAILED',
      'The local port reservation could not be released.',
      createRunAttemptDetails(allocation.lease.toSnapshot().owner, allocation.endpoint.port)
    )
  }
  markReleasing(allocation.lease)
  if (allocation.lease.toSnapshot().state === 'releasing') allocation.lease.release()
}

export async function releaseReservationForActivation(
  allocation: LocalPortAllocation
): Promise<void> {
  try {
    await allocation.reservation.release()
  } catch (error) {
    markReleasing(allocation.lease)
    quarantineIfReleasing(allocation.lease, getErrorMessage(error))
    throw createExpectedAppError(
      'SERVICE_PORT_CLEANUP_FAILED',
      'The local port reservation could not be released before service activation.',
      createRunAttemptDetails(allocation.lease.toSnapshot().owner, allocation.endpoint.port)
    )
  }
  allocation.lease.markActivating()
}

export function markReleasing(lease: ServicePortLease): void {
  const state = lease.toSnapshot().state
  if (state === 'reserved' || state === 'activating' || state === 'bound') {
    lease.markReleasing()
  }
}

export function quarantineIfReleasing(lease: ServicePortLease, reason: string): void {
  if (lease.toSnapshot().state === 'releasing') lease.quarantine(reason)
}

export function linkAbortSignal(source: AbortSignal): AbortController {
  const controller = new AbortController()
  if (source.aborted) {
    controller.abort(source.reason)
  } else {
    const handleSourceAbort = (): void => controller.abort(source.reason)
    source.addEventListener('abort', handleSourceAbort, { once: true })
    controller.signal.addEventListener(
      'abort',
      () => source.removeEventListener('abort', handleSourceAbort),
      { once: true }
    )
  }
  return controller
}

export function waitForOutput(outputReady: Promise<void>, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const handleAbort = (): void => reject(signal.reason)
    signal.addEventListener('abort', handleAbort, { once: true })
    void outputReady.then(
      () => {
        signal.removeEventListener('abort', handleAbort)
        resolve()
      },
      (error: unknown) => {
        signal.removeEventListener('abort', handleAbort)
        reject(error)
      }
    )
  })
}

export async function waitWithTimeout(
  operation: (signal: AbortSignal) => Promise<void>,
  timeoutMs: number
): Promise<void> {
  const controller = new AbortController()
  const timeoutId = setTimeout(
    () =>
      controller.abort(
        createExpectedAppError(
          'SERVICE_PORT_CLEANUP_FAILED',
          'Timed out waiting for listener closure.'
        )
      ),
    timeoutMs
  )
  try {
    await operation(controller.signal)
  } finally {
    clearTimeout(timeoutId)
  }
}

export function createManagedRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `managed-service-run-${Date.now()}-${Math.random()}`
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
