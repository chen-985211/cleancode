import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

interface ManagedServiceApplicationShutdownOperations {
  readonly abortInFlightWork: () => void
  readonly clearApplicationReferences: () => void
}

export class ManagedServiceApplicationShutdown {
  private completion: Promise<void> | null = null
  private preparation: Promise<void> | null = null
  private readonly launches = new Set<Promise<unknown>>()
  private shuttingDown = false

  get isShuttingDown(): boolean {
    return this.shuttingDown
  }

  runLaunch<T>(operation: () => Promise<T>): Promise<T> {
    if (this.shuttingDown) return Promise.reject(applicationShutdownBlocked())
    let result: Promise<T>
    try {
      result = operation()
    } catch (error) {
      result = Promise.reject(error)
    }
    const tracked = result.finally(() => this.launches.delete(tracked))
    this.launches.add(tracked)
    return tracked
  }

  prepare(operations: ManagedServiceApplicationShutdownOperations): Promise<void> {
    if (this.preparation) return this.preparation
    this.shuttingDown = true
    operations.abortInFlightWork()
    this.preparation = this.drainLaunches(operations)
    return this.preparation
  }

  complete(operations: ManagedServiceApplicationShutdownOperations): Promise<void> {
    this.completion ??= this.completeAfterPreparation(operations)
    return this.completion
  }

  createBlockedError(): ReturnType<typeof applicationShutdownBlocked> {
    return applicationShutdownBlocked()
  }

  private async drainLaunches(
    operations: ManagedServiceApplicationShutdownOperations
  ): Promise<void> {
    while (this.launches.size > 0) {
      operations.abortInFlightWork()
      await Promise.allSettled([...this.launches])
    }
    operations.abortInFlightWork()
  }

  private async completeAfterPreparation(
    operations: ManagedServiceApplicationShutdownOperations
  ): Promise<void> {
    const failures: unknown[] = []
    try {
      await this.prepare(operations)
    } catch (error) {
      failures.push(error)
    }
    try {
      operations.clearApplicationReferences()
    } catch (error) {
      failures.push(error)
    }
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Managed service application shutdown failed.')
    }
  }
}

function applicationShutdownBlocked() {
  return createExpectedAppError('RUN_START_BLOCKED', 'Managed services are shutting down.')
}
