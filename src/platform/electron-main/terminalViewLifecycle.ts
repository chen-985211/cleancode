import type { TerminalViewIdentityCommand } from '../../contexts/run/application/use-cases/TerminalSessionService'
import { createExpectedAppError, isAppError } from '../../shared-kernel/application/errors/AppError'
import type { LogEvent, Logger } from '../logging/Logger'

export interface TerminalViewIpcSender {
  isDestroyed(): boolean
  send(channel: string, event: unknown): void
  once(event: 'destroyed', listener: () => void): void
  removeListener(event: 'destroyed', listener: () => void): void
}

export interface TerminalViewLifecycle {
  registerView(command: TerminalViewIdentityCommand, sender: TerminalViewIpcSender): void
  discardView(command: TerminalViewIdentityCommand): void
  releaseView(command: TerminalViewIdentityCommand): Promise<void>
  prepareApplicationShutdown(): Promise<void>
}

interface TerminalViewRegistration {
  readonly command: TerminalViewIdentityCommand
  readonly sender: TerminalViewIpcSender
}

interface TerminalViewSenderRegistration {
  readonly sender: TerminalViewIpcSender
  readonly viewIds: Set<string>
  readonly listener: () => void
}

interface DeferredRelease {
  readonly promise: Promise<void>
  readonly resolve: () => void
  readonly reject: (error: unknown) => void
}

export function createTerminalViewLifecycle(input: {
  readonly detachView: (command: TerminalViewIdentityCommand) => Promise<void>
  readonly logger: Logger
}): TerminalViewLifecycle {
  const registrations = new Map<string, TerminalViewRegistration>()
  const senderRegistrations = new Map<TerminalViewIpcSender, TerminalViewSenderRegistration>()
  const releases = new Map<string, Promise<void>>()
  let isShuttingDown = false
  let shutdownPromise: Promise<void> | null = null

  const discardRegistration = (registration: TerminalViewRegistration): void => {
    if (registrations.get(registration.command.viewId) !== registration) return
    registrations.delete(registration.command.viewId)
    const senderRegistration = senderRegistrations.get(registration.sender)
    if (!senderRegistration) return
    senderRegistration.viewIds.delete(registration.command.viewId)
    if (senderRegistration.viewIds.size > 0) return
    registration.sender.removeListener('destroyed', senderRegistration.listener)
    senderRegistrations.delete(registration.sender)
  }

  const discardView = (command: TerminalViewIdentityCommand): void => {
    const registration = registrations.get(command.viewId)
    if (registration && isSameViewIdentity(registration.command, command)) {
      discardRegistration(registration)
    }
  }

  const releaseView = (command: TerminalViewIdentityCommand): Promise<void> => {
    const releaseKey = createViewReleaseKey(command)
    const existingRelease = releases.get(releaseKey)
    if (existingRelease) return existingRelease

    const registration = registrations.get(command.viewId)
    if (!registration || !isSameViewIdentity(registration.command, command)) {
      return Promise.resolve()
    }

    discardRegistration(registration)
    const deferred = createDeferredRelease()
    releases.set(releaseKey, deferred.promise)
    deferred.promise.then(
      () => releases.delete(releaseKey),
      () => releases.delete(releaseKey)
    )

    try {
      void input.detachView(command).then(deferred.resolve, deferred.reject)
    } catch (error) {
      deferred.reject(error)
    }
    return deferred.promise
  }

  const getOrCreateSenderRegistration = (
    sender: TerminalViewIpcSender
  ): TerminalViewSenderRegistration => {
    const existing = senderRegistrations.get(sender)
    if (existing) return existing

    const senderRegistration: TerminalViewSenderRegistration = {
      listener: () => {
        for (const viewId of [...senderRegistration.viewIds]) {
          const registration = registrations.get(viewId)
          if (!registration || registration.sender !== sender) continue
          void releaseView(registration.command).catch((error) => {
            input.logger.warn({
              error: resolveLogError(error),
              operation: 'detachDestroyedTerminalView',
              outcome: 'failure',
              scope: 'run.terminal-view'
            })
          })
        }
      },
      sender,
      viewIds: new Set()
    }
    sender.once('destroyed', senderRegistration.listener)
    senderRegistrations.set(sender, senderRegistration)
    return senderRegistration
  }

  const registerView = (
    command: TerminalViewIdentityCommand,
    sender: TerminalViewIpcSender
  ): void => {
    if (isShuttingDown) {
      throw createExpectedAppError(
        'TERMINAL_RUNTIME_NOT_READY',
        'Terminal views cannot attach while the application is shutting down.'
      )
    }

    const existing = registrations.get(command.viewId)
    if (existing) discardRegistration(existing)
    const registration = { command, sender }
    registrations.set(command.viewId, registration)
    getOrCreateSenderRegistration(sender).viewIds.add(command.viewId)
  }

  const prepareApplicationShutdown = (): Promise<void> => {
    if (shutdownPromise) return shutdownPromise
    isShuttingDown = true
    const pending = [...registrations.values()].map(({ command }) => releaseView(command))
    shutdownPromise = settleViewReleases([...new Set([...releases.values(), ...pending])])
    return shutdownPromise
  }

  return { discardView, prepareApplicationShutdown, registerView, releaseView }
}

function createDeferredRelease(): DeferredRelease {
  let resolve: () => void = () => undefined
  let reject: (error: unknown) => void = () => undefined
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

async function settleViewReleases(releases: readonly Promise<void>[]): Promise<void> {
  const results = await Promise.allSettled(releases)
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  )
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Multiple terminal views failed to release.')
  }
}

function createViewReleaseKey(command: TerminalViewIdentityCommand): string {
  return [
    command.projectId,
    command.workspaceId,
    command.blockId,
    command.sessionId,
    command.runId,
    command.generation,
    command.viewId
  ].join('\u0000')
}

function isSameViewIdentity(
  left: TerminalViewIdentityCommand,
  right: TerminalViewIdentityCommand
): boolean {
  return createViewReleaseKey(left) === createViewReleaseKey(right)
}

function resolveLogError(error: unknown): NonNullable<LogEvent['error']> {
  if (isAppError(error)) {
    return {
      code: error.code,
      isExpected: error.isExpected,
      message: error.message,
      stack: error.isExpected ? undefined : error.stack
    }
  }
  if (error instanceof Error) {
    return {
      code: 'UNEXPECTED_ERROR',
      isExpected: false,
      message: error.message,
      stack: error.stack
    }
  }
  return { code: 'UNEXPECTED_ERROR', isExpected: false, message: String(error) }
}
