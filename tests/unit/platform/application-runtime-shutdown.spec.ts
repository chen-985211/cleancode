import { vi } from 'vitest'

import { createExpectedAppError } from '../../../src/shared-kernel/application/errors/AppError'
import type { Logger } from '../../../src/platform/logging/Logger'
import { disposeApplicationRuntime } from '../../../src/platform/electron-main/applicationRuntimeShutdown'

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
    const disposeAgentSessions = vi.fn(async () => {
      throw agentFailure
    })

    let shutdownSettled = false
    const shutdown = disposeApplicationRuntime({
      disposeAgentSessions,
      disposeRunLifecycle,
      disposeTerminalSessions,
      logger
    }).finally(() => {
      shutdownSettled = true
    })

    await vi.waitFor(() => {
      expect(disposeRunLifecycle).toHaveBeenCalledOnce()
      expect(disposeTerminalSessions).toHaveBeenCalledOnce()
      expect(disposeAgentSessions).toHaveBeenCalledOnce()
    })
    expect(shutdownSettled).toBe(false)

    rejectTerminalCleanup(terminalFailure)
    await shutdown

    expect(logger.error).toHaveBeenCalledTimes(3)
    expect(logger.error).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        details: expect.objectContaining({ cleanupStage: 'run-lifecycle', failureCount: 3 }),
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
        details: expect.objectContaining({ cleanupStage: 'terminal-sessions', failureCount: 3 }),
        error: expect.objectContaining({
          code: 'SERVICE_PORT_CLEANUP_FAILED',
          isExpected: true,
          message: 'terminal cleanup failed'
        })
      })
    )
    expect(logger.error).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        details: expect.objectContaining({ cleanupStage: 'agent-sessions', failureCount: 3 }),
        error: expect.objectContaining({
          code: 'UNEXPECTED_ERROR',
          isExpected: false,
          message: 'agent cleanup failed'
        })
      })
    )
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
