import type { TerminalSessionSnapshot } from '../../application/dto/TerminalSessionSnapshot'
import type { TerminalProcessPort } from '../../application/ports/TerminalProcessPort'
import {
  resolveTerminalOwnerRef,
  type TerminalRunScope
} from '../../domain/value-objects/TerminalRunScope'
import type { TerminalProviderApplicationDetachResult } from './TerminalProviderProtocol'

const defaultShutdownConcurrency = 8

export interface TerminalProviderShutdownSession {
  readonly snapshot: TerminalSessionSnapshot
  readonly persistence: {
    checkpoint(truncateOutputLog: boolean): Promise<void>
  }
}

interface TerminalProviderShutdownCoordinatorOptions {
  readonly concurrency?: number
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

  constructor(private readonly options: TerminalProviderShutdownCoordinatorOptions) {
    this.concurrency = Math.max(1, Math.floor(options.concurrency ?? defaultShutdownConcurrency))
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
          await this.options.processes.stop(candidate.identity.sessionId)
          stoppedSessionCount += 1
        }
        await this.options.retireSession(candidate.identity)
        retiredSessionCount += 1
      } catch (error) {
        failedSessions.add(candidate.identity.sessionId)
        this.options.onFailure?.(error, candidate.session, 'stop-or-retire')
        await candidate.session.persistence
          .checkpoint(true)
          .catch((checkpointError) =>
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
            await candidate.session.persistence.checkpoint(true)
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

function captureSession(session: TerminalProviderShutdownSession): CapturedSession {
  const snapshot = session.snapshot
  return {
    identity: snapshot,
    isRunning: snapshot.status === 'running',
    session,
    shouldTerminate: shouldTerminateProviderSession(snapshot)
  }
}

export function shouldTerminateProviderSession(snapshot: TerminalSessionSnapshot): boolean {
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
