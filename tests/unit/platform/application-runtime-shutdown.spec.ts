import { vi } from 'vitest'

import { createExpectedAppError } from '../../../src/shared-kernel/application/errors/AppError'
import type { Logger } from '../../../src/platform/logging/Logger'
import {
  createApplicationRuntimeShutdownCoordinator,
  disposeApplicationRuntime
} from '../../../src/platform/electron-main/applicationRuntimeShutdown'

describe('application runtime shutdown', () => {
  it('waits for every cleanup stage and records every failure before returning', async () => {
    const logger = createRecordingLogger()
    const lifecycleFailure = new Error('run lifecycle failed')
    const terminalFailure = createExpectedAppError(
      'SERVICE_PORT_CLEANUP_FAILED',
      'terminal cleanup failed'
    )
    const agentFailure = new Error('agent cleanup failed')
    let rejectTerminalCleanup: (error: Error) => void = () => undefined
    const pendingTerminalCleanup = new Promise<void>((_resolve, reject) => {
      rejectTerminalCleanup = reject
    })
    const disposeRunLifecycle = vi.fn(async () => {
      throw new AggregateError([lifecycleFailure], 'run cleanup failed')
    })
    const disposeTerminalSessions = vi.fn(async () => pendingTerminalCleanup)
    const disposeTerminalViews = vi.fn(async () => undefined)
    const prepareTerminalWorkflows = vi.fn(async () => undefined)
    const prepareAgentSessions = vi.fn(async () => {
      throw agentFailure
    })
    const completeTerminalWorkflows = vi.fn(async () => undefined)
    const completeAgentSessions = vi.fn(async () => undefined)

    let shutdownSettled = false
    const shutdown = disposeApplicationRuntime({
      completeAgentSessions,
      completeTerminalWorkflows,
      disposeRunLifecycle,
      disposeTerminalSessions,
      disposeTerminalViews,
      prepareAgentSessions,
      prepareTerminalWorkflows,
      logger
    }).finally(() => {
      shutdownSettled = true
    })

    await vi.waitFor(() => {
      expect(disposeRunLifecycle).toHaveBeenCalledOnce()
      expect(disposeTerminalSessions).toHaveBeenCalledOnce()
      expect(disposeTerminalViews).toHaveBeenCalledOnce()
      expect(prepareTerminalWorkflows).toHaveBeenCalledOnce()
      expect(prepareAgentSessions).toHaveBeenCalledOnce()
      expect(completeTerminalWorkflows).not.toHaveBeenCalled()
      expect(completeAgentSessions).not.toHaveBeenCalled()
    })
    expect(shutdownSettled).toBe(false)

    rejectTerminalCleanup(terminalFailure)
    await shutdown

    expect(logger.error).toHaveBeenCalledTimes(3)
    expect(logger.error).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        details: expect.objectContaining({
          cleanupStage: 'run-lifecycle',
          failureCount: 3,
          timedOut: false
        }),
        durationMs: expect.any(Number),
        error: expect.objectContaining({
          code: 'UNEXPECTED_ERROR',
          isExpected: false,
          message: 'run lifecycle failed'
        }),
        operation: 'disposeApplicationRuntime',
        outcome: 'failure',
        scope: 'platform.lifecycle'
      })
    )
    expect(logger.error).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        details: expect.objectContaining({
          cleanupStage: 'agent-sessions-prepare',
          failureCount: 3,
          timedOut: false
        }),
        durationMs: expect.any(Number),
        error: expect.objectContaining({
          code: 'UNEXPECTED_ERROR',
          isExpected: false,
          message: 'agent cleanup failed'
        })
      })
    )
    expect(logger.error).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        details: expect.objectContaining({
          cleanupStage: 'terminal-sessions',
          failureCount: 3,
          timedOut: false
        }),
        durationMs: expect.any(Number),
        error: expect.objectContaining({
          code: 'SERVICE_PORT_CLEANUP_FAILED',
          isExpected: true,
          message: 'terminal cleanup failed'
        })
      })
    )
    expect(completeTerminalWorkflows).toHaveBeenCalledOnce()
    expect(completeAgentSessions).toHaveBeenCalledOnce()
  })

  it('orders the shutdown gate, views, business preparation, provider handoff and completion', async () => {
    const order: string[] = []
    const logger = createRecordingLogger()
    const record = (stage: string) => async () => {
      order.push(stage)
    }

    await disposeApplicationRuntime({
      completeAgentSessions: record('agent-sessions-complete'),
      completeTerminalWorkflows: record('terminal-workflows-complete'),
      disposeRunLifecycle: record('run-lifecycle'),
      disposeTerminalSessions: record('terminal-sessions'),
      disposeTerminalViews: async () => {
        order.push('terminal-views')
        throw createExpectedAppError('TERMINAL_MODEL_NOT_FOUND', 'Terminal model was not found.')
      },
      prepareAgentSessions: record('agent-sessions-prepare'),
      prepareTerminalWorkflows: record('terminal-workflows-prepare'),
      logger
    })

    expect(order).toEqual([
      'run-lifecycle',
      'terminal-views',
      'agent-sessions-prepare',
      'terminal-workflows-prepare',
      'terminal-sessions',
      'agent-sessions-complete',
      'terminal-workflows-complete'
    ])
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ cleanupStage: 'terminal-views' }),
        durationMs: expect.any(Number),
        error: expect.objectContaining({
          code: 'TERMINAL_MODEL_NOT_FOUND',
          isExpected: true
        })
      })
    )
  })

  it('starts terminal session cleanup before the global deadline when an earlier stage never settles', async () => {
    vi.useFakeTimers()
    try {
      const logger = createRecordingLogger()
      const neverSettles = () => new Promise<void>(() => undefined)
      const disposeTerminalSessions = vi.fn(neverSettles)
      const completeAgentSessions = vi.fn(async () => undefined)
      const completeTerminalWorkflows = vi.fn(async () => undefined)
      const shutdown = disposeApplicationRuntime(
        {
          completeAgentSessions,
          completeTerminalWorkflows,
          disposeRunLifecycle: vi.fn(neverSettles),
          disposeTerminalSessions,
          disposeTerminalViews: vi.fn(async () => undefined),
          prepareAgentSessions: vi.fn(async () => undefined),
          prepareTerminalWorkflows: vi.fn(async () => undefined),
          logger
        },
        {
          correlationId: 'shutdown-timeout-test',
          terminalSessionReserveMs: 40,
          timeoutMs: 100
        }
      )

      await vi.advanceTimersByTimeAsync(59)
      expect(disposeTerminalSessions).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(1)
      expect(disposeTerminalSessions).toHaveBeenCalledOnce()

      let shutdownSettled = false
      void shutdown.finally(() => {
        shutdownSettled = true
      })
      await vi.advanceTimersByTimeAsync(39)
      expect(shutdownSettled).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      await shutdown

      const timeoutEvents = logger.warn.mock.calls.map(([event]) => event)
      expect(timeoutEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            correlationId: 'shutdown-timeout-test',
            details: expect.objectContaining({
              cleanupStage: 'run-lifecycle',
              timedOut: true
            }),
            durationMs: expect.any(Number),
            operation: 'disposeApplicationRuntime',
            outcome: 'failure'
          }),
          expect.objectContaining({
            correlationId: 'shutdown-timeout-test',
            details: expect.objectContaining({
              cleanupStage: 'terminal-sessions',
              timedOut: true
            }),
            durationMs: expect.any(Number),
            operation: 'disposeApplicationRuntime',
            outcome: 'failure'
          })
        ])
      )

      const loggedStages = [
        ...logger.info.mock.calls,
        ...logger.warn.mock.calls,
        ...logger.error.mock.calls
      ].map(([event]) => event.details?.cleanupStage)
      expect(new Set(loggedStages)).toEqual(new Set(['run-lifecycle', 'terminal-sessions']))
      expect(completeAgentSessions).toHaveBeenCalledOnce()
      expect(completeTerminalWorkflows).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reuses one shutdown promise and keeps a successful shutdown silent', async () => {
    const logger = createRecordingLogger()
    const disposeRunLifecycle = vi.fn(async () => undefined)
    const disposeTerminalViews = vi.fn(async () => undefined)
    const prepareTerminalWorkflows = vi.fn(async () => undefined)
    const disposeTerminalSessions = vi.fn(async () => undefined)
    const prepareAgentSessions = vi.fn(async () => undefined)
    const completeTerminalWorkflows = vi.fn(async () => undefined)
    const completeAgentSessions = vi.fn(async () => undefined)
    const coordinator = createApplicationRuntimeShutdownCoordinator({
      completeAgentSessions,
      completeTerminalWorkflows,
      disposeRunLifecycle,
      disposeTerminalSessions,
      disposeTerminalViews,
      prepareAgentSessions,
      prepareTerminalWorkflows,
      logger
    })

    const firstShutdown = coordinator.dispose()
    const repeatedShutdown = coordinator.dispose()

    expect(repeatedShutdown).toBe(firstShutdown)
    await firstShutdown
    expect(disposeRunLifecycle).toHaveBeenCalledOnce()
    expect(disposeTerminalViews).toHaveBeenCalledOnce()
    expect(prepareTerminalWorkflows).toHaveBeenCalledOnce()
    expect(disposeTerminalSessions).toHaveBeenCalledOnce()
    expect(prepareAgentSessions).toHaveBeenCalledOnce()
    expect(completeTerminalWorkflows).toHaveBeenCalledOnce()
    expect(completeAgentSessions).toHaveBeenCalledOnce()

    expect(logger.debug).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })
})

function createRecordingLogger() {
  return {
    debug: vi.fn<Logger['debug']>(),
    error: vi.fn<Logger['error']>(),
    info: vi.fn<Logger['info']>(),
    warn: vi.fn<Logger['warn']>()
  } satisfies Logger
}
