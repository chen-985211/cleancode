import type { TerminalSessionSnapshot } from '../../application/dto/TerminalSessionSnapshot'
import type { TerminalProcessPort } from '../../application/ports/TerminalProcessPort'
import {
  resolveTerminalOwnerRef,
  type TerminalRunScope
} from '../../domain/value-objects/TerminalRunScope'
import type { TerminalProviderApplicationDetachResult } from './TerminalProviderProtocol'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

const defaultShutdownConcurrency = 8
const defaultCheckpointDeadlineMs = 2_000
const defaultRetireDeadlineMs = 750
const defaultStopDeadlineMs = 2_500

export interface TerminalProviderShutdownSession {
  readonly snapshot: TerminalSessionSnapshot
  readonly starting?: boolean
  readonly persistence: {
    checkpoint(truncateOutputLog: boolean): Promise<void>
  }
}

interface TerminalProviderShutdownCoordinatorOptions {
  readonly concurrency?: number
  readonly checkpointDeadlineMs?: number
  readonly operationDeadlineMs?: number
  readonly retireDeadlineMs?: number
  readonly stopDeadlineMs?: number
  readonly processes: Pick<TerminalProcessPort, 'stop'>
  readonly retireSession: (identity: TerminalRunScope) => Promise<void>
  readonly onFailure?: (
    error: unknown,
    session: TerminalProviderShutdownSession,
    phase: 'checkpoint' | 'stop-or-retire'
  ) => void
}

interface TerminalProviderShutdownInput {
  readonly releaseId: string
  readonly sessions: readonly TerminalProviderShutdownSession[]
}

interface CapturedSession {
  readonly identity: TerminalRunScope
  readonly isRunning: boolean
  readonly session: TerminalProviderShutdownSession
  readonly shouldTerminate: boolean
}

export class TerminalProviderShutdownCoordinator {
  private readonly concurrency: number
  private readonly checkpointDeadlineMs: number
  private readonly retireDeadlineMs: number
  private readonly stopDeadlineMs: number

  constructor(private readonly options: TerminalProviderShutdownCoordinatorOptions) {
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? defaultShutdownConcurrency))
    this.checkpointDeadlineMs = resolveDeadline(
      options.operationDeadlineMs ?? options.checkpointDeadlineMs,
      defaultCheckpointDeadlineMs
    )
    this.retireDeadlineMs = resolveDeadline(
      options.operationDeadlineMs ?? options.retireDeadlineMs,
      defaultRetireDeadlineMs
    )
    this.stopDeadlineMs = resolveDeadline(
      options.operationDeadlineMs ?? options.stopDeadlineMs,
      defaultStopDeadlineMs
    )
  }

  async release(
    input: TerminalProviderShutdownInput
  ): Promise<TerminalProviderApplicationDetachResult> {
    const captured = input.sessions.map(captureSession)
    const initialTerminateCandidates = captured.filter(({ shouldTerminate }) => shouldTerminate)
    const retained = captured.filter(({ shouldTerminate }) => !shouldTerminate)
    let terminateCandidateCount = initialTerminateCandidates.length
    let retainedSessionCount = 0
    let stoppedSessionCount = 0
    let retiredSessionCount = 0
    const failedSessions = new Set<string>()

    const terminate = async (candidate: CapturedSession): Promise<void> => {
      try {
        if (candidate.isRunning) {
          await withOperationDeadline(
            this.options.processes.stop(candidate.identity.sessionId),
            this.stopDeadlineMs,
            'stop terminal process'
          )
          stoppedSessionCount += 1
        }
        await withOperationDeadline(
          this.options.retireSession(candidate.identity),
          this.retireDeadlineMs,
          'retire terminal session'
        )
        retiredSessionCount += 1
      } catch (error) {
        failedSessions.add(candidate.identity.sessionId)
        this.options.onFailure?.(error, candidate.session, 'stop-or-retire')
        await withOperationDeadline(
          candidate.session.persistence.checkpoint(true),
          this.checkpointDeadlineMs,
          'checkpoint failed terminal session'
        ).catch((checkpointError) =>
          this.options.onFailure?.(checkpointError, candidate.session, 'checkpoint')
        )
      }
    }

    await runWithConcurrency(
      [...retained, ...initialTerminateCandidates],
      this.concurrency,
      async (candidate) => {
        if (!candidate.shouldTerminate) {
          try {
            await withOperationDeadline(
              candidate.session.persistence.checkpoint(true),
              this.checkpointDeadlineMs,
              'checkpoint terminal session'
            )
            retainedSessionCount += 1
          } catch (error) {
            failedSessions.add(candidate.identity.sessionId)
            this.options.onFailure?.(error, candidate.session, 'checkpoint')
            terminateCandidateCount += 1
            await terminate(candidate)
          }
          return
        }
        await terminate(candidate)
      }
    )

    return {
      releaseId: input.releaseId,
      outcome: failedSessions.size === 0 ? 'completed' : 'partial-failure',
      terminateCandidateCount,
      retainedSessionCount,
      stoppedSessionCount,
      retiredSessionCount,
      failureCount: failedSessions.size
    }
  }
}

function resolveDeadline(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.floor(value ?? fallback))
}

function withOperationDeadline<T>(
  operation: Promise<T>,
  deadlineMs: number,
  operationName: string
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        createExpectedAppError(
          'COMMAND_TIMED_OUT',
          `Terminal provider could not ${operationName} before its deadline.`
        )
      )
    }, deadlineMs)
    timeout.unref()
  })
  return Promise.race([operation, deadline]).finally(() => {
    if (timeout) clearTimeout(timeout)
  })
}

function captureSession(session: TerminalProviderShutdownSession): CapturedSession {
  const snapshot = session.snapshot
  return {
    identity: snapshot,
    isRunning: snapshot.status === 'running' || session.starting === true,
    session,
    shouldTerminate: shouldTerminateProviderSession(snapshot)
  }
}

function shouldTerminateProviderSession(snapshot: TerminalSessionSnapshot): boolean {
  return (
    snapshot.kind === 'workflow' ||
    resolveTerminalOwnerRef(snapshot).kind === 'agent' ||
    snapshot.retentionPolicy === 'terminate-on-application-exit'
  )
}

async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  operation: (item: T) => Promise<void>
): Promise<void> {
  let nextIndex = 0
  const workerCount = Math.min(concurrency, items.length)
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex]
      nextIndex += 1
      if (item) await operation(item)
    }
  })
  await Promise.all(workers)
}
