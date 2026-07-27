import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { ActiveWorkflowRun } from './TerminalWorkflowRuntimeState'

interface TerminalWorkflowApplicationShutdownOperations {
  readonly clearNodeGuards: (activeRun: ActiveWorkflowRun, blockId: string) => void
  readonly completeManagedServices: () => Promise<void>
  readonly listRuns: () => readonly ActiveWorkflowRun[]
  readonly prepareManagedServices: () => Promise<void>
  readonly removeRun: (activeRun: ActiveWorkflowRun) => void
}

export class TerminalWorkflowApplicationShutdown {
  private completion: Promise<void> | null = null
  private preparation: Promise<void> | null = null
  private readonly starts = new Set<Promise<unknown>>()
  private shuttingDown = false

  get isShuttingDown(): boolean {
    return this.shuttingDown
  }

  runStart<T>(operation: () => Promise<T>): Promise<T> {
    if (this.shuttingDown) {
      return Promise.reject(
        createExpectedAppError('RUN_START_BLOCKED', 'Terminal workflows are shutting down.')
      )
    }
    let result: Promise<T>
    try {
      result = operation()
    } catch (error) {
      result = Promise.reject(error)
    }
    const tracked = result.finally(() => this.starts.delete(tracked))
    this.starts.add(tracked)
    return tracked
  }

  prepare(operations: TerminalWorkflowApplicationShutdownOperations): Promise<void> {
    if (this.preparation) return this.preparation
    this.shuttingDown = true
    const managedPreparation = settleInvocation(operations.prepareManagedServices)
    this.closeRunGuards(operations)
    this.preparation = this.prepareAfterClosing(operations, managedPreparation)
    return this.preparation
  }

  complete(operations: TerminalWorkflowApplicationShutdownOperations): Promise<void> {
    this.completion ??= this.completeAfterPreparation(operations)
    return this.completion
  }

  private async completeAfterPreparation(
    operations: TerminalWorkflowApplicationShutdownOperations
  ): Promise<void> {
    let preparationFailure: unknown
    try {
      await this.prepare(operations)
    } catch (error) {
      preparationFailure = error
    }

    this.shuttingDown = true
    for (const activeRun of operations.listRuns()) {
      activeRun.hardDisposing = true
      for (const node of activeRun.plan.nodes) {
        operations.clearNodeGuards(activeRun, node.blockId)
      }
      activeRun.outputTails.clear()
      activeRun.pendingNodeStarts.clear()
      activeRun.sessionIds.clear()
      for (const unregister of activeRun.lifecycleUnregisters.splice(0)) unregister()
      operations.removeRun(activeRun)
    }
    const completionResult = await Promise.allSettled([
      settleInvocation(operations.completeManagedServices)
    ])
    const failures = [
      ...(preparationFailure === undefined ? [] : [preparationFailure]),
      ...completionResult.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []))
    ]
    throwApplicationShutdownFailures(failures)
  }

  private closeRunGuards(operations: TerminalWorkflowApplicationShutdownOperations): void {
    for (const activeRun of operations.listRuns()) {
      activeRun.hardDisposing = true
      for (const node of activeRun.plan.nodes) {
        operations.clearNodeGuards(activeRun, node.blockId)
      }
    }
  }

  private async drainStarts(
    operations: TerminalWorkflowApplicationShutdownOperations
  ): Promise<void> {
    while (true) {
      this.closeRunGuards(operations)
      const pending = [
        ...this.starts,
        ...operations.listRuns().flatMap((activeRun) => [...activeRun.pendingNodeStarts])
      ]
      if (pending.length === 0) break
      await Promise.allSettled(pending)
    }
    this.closeRunGuards(operations)
  }

  private async prepareAfterClosing(
    operations: TerminalWorkflowApplicationShutdownOperations,
    managedPreparation: Promise<void>
  ): Promise<void> {
    const results = await Promise.allSettled([managedPreparation, this.drainStarts(operations)])
    throwApplicationShutdownFailures(
      results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []))
    )
  }
}

function settleInvocation(operation: () => Promise<void>): Promise<void> {
  try {
    return operation()
  } catch (error) {
    return Promise.reject(error)
  }
}

function throwApplicationShutdownFailures(failures: readonly unknown[]): void {
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Terminal workflow application shutdown failed.')
  }
}
