import type { TerminalSessionSnapshot } from '../../../../src/contexts/run/application/dto/TerminalSessionSnapshot'
import {
  TerminalProviderShutdownCoordinator,
  type TerminalProviderShutdownSession
} from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderShutdownCoordinator'

describe('terminal provider shutdown coordinator', () => {
  it('uses the Provider-owned snapshot and stops sessions with bounded concurrency', async () => {
    const sessions = [
      ...Array.from({ length: 18 }, (_, index) => createSession(`default-${index}`)),
      createSession('workflow-retained', {
        kind: 'workflow',
        retentionPolicy: 'keep-after-application-exit'
      }),
      createSession('agent-retained', {
        owner: { id: 'agent-1', kind: 'agent' },
        retentionPolicy: 'keep-after-application-exit'
      }),
      createSession('retained', {
        kind: 'direct',
        retentionPolicy: 'keep-after-application-exit'
      })
    ]
    const stopGate = deferred<void>()
    const stopped: string[] = []
    const retired: string[] = []
    const trace: string[] = []
    let activeStops = 0
    let maximumActiveStops = 0
    const coordinator = new TerminalProviderShutdownCoordinator({
      processes: {
        stop: async (sessionId) => {
          stopped.push(sessionId)
          trace.push(`stop-start:${sessionId}`)
          activeStops += 1
          maximumActiveStops = Math.max(maximumActiveStops, activeStops)
          await stopGate.promise
          activeStops -= 1
          trace.push(`stop-complete:${sessionId}`)
        }
      },
      retireSession: async (identity) => {
        trace.push(`retire:${identity.sessionId}`)
        retired.push(identity.sessionId)
      }
    })

    const release = coordinator.release({
      releaseId: 'release-1',
      sessions
    })
    await vi.waitFor(() => expect(stopped).toHaveLength(8))
    expect(maximumActiveStops).toBe(8)

    stopGate.resolve()
    const result = await release

    expect(result).toEqual({
      releaseId: 'release-1',
      outcome: 'completed',
      terminateCandidateCount: 20,
      retainedSessionCount: 1,
      stoppedSessionCount: 20,
      retiredSessionCount: 20,
      failureCount: 0
    })
    expect(stopped).toContain('agent-retained')
    expect(stopped).not.toContain('retained')
    expect(retired).not.toContain('retained')
    expect(sessions.at(-1)?.persistence.checkpoint).toHaveBeenCalledOnce()
    expect(maximumActiveStops).toBe(8)
    for (const sessionId of stopped) {
      expect(trace.indexOf(`stop-complete:${sessionId}`)).toBeLessThan(
        trace.indexOf(`retire:${sessionId}`)
      )
    }
  })

  it('does not retire a session whose physical stop failed and preserves its evidence', async () => {
    const failed = createSession('failed-stop')
    const sessions = new Map([[failed.snapshot.sessionId, failed]])
    const coordinator = new TerminalProviderShutdownCoordinator({
      processes: {
        stop: async () => {
          throw new Error('process is still alive')
        }
      },
      retireSession: async (identity) => {
        sessions.delete(identity.sessionId)
      }
    })

    const result = await coordinator.release({
      releaseId: 'release-failed',
      sessions: [...sessions.values()]
    })

    expect(result).toEqual({
      releaseId: 'release-failed',
      outcome: 'partial-failure',
      terminateCandidateCount: 1,
      retainedSessionCount: 0,
      stoppedSessionCount: 0,
      retiredSessionCount: 0,
      failureCount: 1
    })
    expect(sessions.has('failed-stop')).toBe(true)
    expect(failed.persistence.checkpoint).toHaveBeenCalledOnce()
    expect(sessions.get('failed-stop')?.snapshot.status).toBe('running')
  })

  it('retires already-ended terminate candidates without asking the process adapter to stop', async () => {
    const ended = createSession('ended', { processId: null, status: 'exited' })
    const stop = vi.fn(async () => undefined)
    const retireSession = vi.fn(async () => undefined)
    const coordinator = new TerminalProviderShutdownCoordinator({
      processes: { stop },
      retireSession
    })

    const result = await coordinator.release({
      releaseId: 'release-ended',
      sessions: [ended]
    })

    expect(stop).not.toHaveBeenCalled()
    expect(retireSession).toHaveBeenCalledWith(ended.snapshot)
    expect(result.stoppedSessionCount).toBe(0)
    expect(result.retiredSessionCount).toBe(1)
  })

  it('terminates a retained live session when its required checkpoint fails', async () => {
    const retained = createSession('unsafe-retained', {
      retentionPolicy: 'keep-after-application-exit'
    })
    vi.mocked(retained.persistence.checkpoint).mockRejectedValueOnce(
      new Error('checkpoint unavailable')
    )
    const stop = vi.fn(async () => undefined)
    const retireSession = vi.fn(async () => undefined)
    const onFailure = vi.fn()
    const coordinator = new TerminalProviderShutdownCoordinator({
      processes: { stop },
      retireSession,
      onFailure
    })

    const result = await coordinator.release({
      releaseId: 'release-unsafe-retained',
      sessions: [retained]
    })

    expect(stop).toHaveBeenCalledWith('unsafe-retained')
    expect(retireSession).toHaveBeenCalledWith(retained.snapshot)
    expect(onFailure).toHaveBeenCalledWith(expect.any(Error), retained, 'checkpoint')
    expect(result).toEqual({
      releaseId: 'release-unsafe-retained',
      outcome: 'partial-failure',
      terminateCandidateCount: 1,
      retainedSessionCount: 0,
      stoppedSessionCount: 1,
      retiredSessionCount: 1,
      failureCount: 1
    })
  })

  it('retains a session whose durable checkpoint completes within the handoff budget', async () => {
    vi.useFakeTimers()
    try {
      const retained = createSession('slow-durable-checkpoint', {
        retentionPolicy: 'keep-after-application-exit'
      })
      const checkpoint = deferred<void>()
      vi.mocked(retained.persistence.checkpoint).mockImplementation(() => checkpoint.promise)
      const stop = vi.fn(async () => undefined)
      const retireSession = vi.fn(async () => undefined)
      const onFailure = vi.fn()
      const coordinator = new TerminalProviderShutdownCoordinator({
        processes: { stop },
        retireSession,
        onFailure
      })

      const release = coordinator.release({
        releaseId: 'release-slow-durable-checkpoint',
        sessions: [retained]
      })
      await vi.advanceTimersByTimeAsync(1_000)
      checkpoint.resolve()
      const result = await release

      expect(stop).not.toHaveBeenCalled()
      expect(retireSession).not.toHaveBeenCalled()
      expect(onFailure).not.toHaveBeenCalled()
      expect(result).toEqual({
        releaseId: 'release-slow-durable-checkpoint',
        outcome: 'completed',
        terminateCandidateCount: 0,
        retainedSessionCount: 1,
        stoppedSessionCount: 0,
        retiredSessionCount: 0,
        failureCount: 0
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it('bounds a checkpoint that never settles and continues releasing the controller', async () => {
    const retained = createSession('blocked-checkpoint', {
      retentionPolicy: 'keep-after-application-exit'
    })
    vi.mocked(retained.persistence.checkpoint).mockImplementation(
      () => new Promise(() => undefined)
    )
    const stop = vi.fn(async () => undefined)
    const retireSession = vi.fn(async () => undefined)
    const onFailure = vi.fn()
    const coordinator = new TerminalProviderShutdownCoordinator({
      operationDeadlineMs: 25,
      processes: { stop },
      retireSession,
      onFailure
    })

    const result = await coordinator.release({
      releaseId: 'release-blocked-checkpoint',
      sessions: [retained]
    })

    expect(stop).toHaveBeenCalledWith('blocked-checkpoint')
    expect(retireSession).toHaveBeenCalledWith(retained.snapshot)
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'COMMAND_TIMED_OUT' }),
      retained,
      'checkpoint'
    )
    expect(result).toMatchObject({ outcome: 'partial-failure', retiredSessionCount: 1 })
  })
})

function createSession(
  sessionId: string,
  overrides: Partial<TerminalSessionSnapshot> = {}
): TerminalProviderShutdownSession {
  return {
    snapshot: {
      projectId: 'project-1',
      projectDirectory: '/work/app',
      workspaceId: 'main',
      workspaceDirectory: '/work/app',
      gitBranch: 'main',
      blockId: `block-${sessionId}`,
      sessionId,
      runId: `run-${sessionId}`,
      generation: 1,
      id: sessionId,
      terminalBlockId: `block-${sessionId}`,
      workingDirectory: '/work/app',
      processId: 4242,
      status: 'running',
      kind: 'interactive',
      retentionPolicy: 'terminate-on-application-exit',
      recoveryKind: 'fresh',
      terminalSourceTheme: 'dark',
      inputHistory: [],
      exitCode: null,
      failureReason: null,
      ...overrides
    },
    persistence: {
      checkpoint: vi.fn(async () => undefined)
    }
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}
