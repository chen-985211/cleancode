import type { TerminalSessionSnapshot } from '../../../../src/contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalProcessPort } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import type {
  TerminalRuntimeProviderPort,
  TerminalRuntimeRecoveryIssue
} from '../../../../src/contexts/run/application/ports/TerminalRuntimeProviderPort'
import { RunLifecycleService } from '../../../../src/contexts/run/application/use-cases/RunLifecycleService'
import { RunRuntimeCoordinator } from '../../../../src/contexts/run/application/use-cases/RunRuntimeCoordinator'
import { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'
import { createExpectedAppError } from '../../../../src/shared-kernel/application/errors/AppError'

describe('terminal runtime recovery', () => {
  it('keeps starts blocked after a failed reconciliation and opens one new runtime epoch on retry', async () => {
    const provider = new RecordingRuntimeProvider(warmSession(), 1)
    const lifecycle = new RunLifecycleService({ initialRuntimePhase: 'initializing' })
    const service = new TerminalSessionService(
      new NoopProcessPort(),
      undefined,
      lifecycle,
      undefined,
      provider
    )
    const coordinator = new RunRuntimeCoordinator(
      lifecycle,
      () => service.initializeRuntime({ onOutput: () => undefined, onExit: () => undefined }),
      async () => undefined
    )

    await expect(coordinator.initialize()).rejects.toMatchObject({
      code: 'TERMINAL_PROVIDER_UNAVAILABLE'
    })
    expect(lifecycle.getRuntimeAvailability()).toEqual({
      phase: 'unavailable',
      epoch: 0,
      errorCode: 'TERMINAL_PROVIDER_UNAVAILABLE',
      retryable: true
    })

    await coordinator.initialize()
    expect(lifecycle.getRuntimeAvailability()).toEqual({
      phase: 'ready',
      epoch: 1,
      errorCode: null,
      retryable: false
    })
    expect(provider.initializeCount).toBe(2)
  })

  it('revokes the visible retention policy when durable recovery becomes unavailable', async () => {
    const provider = new RecordingRuntimeProvider()
    const service = new TerminalSessionService(
      new NoopProcessPort(),
      undefined,
      undefined,
      undefined,
      provider
    )
    const onSessionUpdated = vi.fn()

    await service.initializeRuntime({
      onOutput: () => undefined,
      onExit: () => undefined,
      onSessionUpdated
    })
    provider.reportIssue({ reason: 'storage-unavailable', sessionId: 'session-1' })

    expect(service.getSession('session-1')?.retentionPolicy).toBe('terminate-on-application-exit')
    expect(onSessionUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        retentionPolicy: 'terminate-on-application-exit'
      })
    )
  })

  it('retires historical recovery data during hard project cleanup', async () => {
    const provider = new RecordingRuntimeProvider(historicalSession())
    const lifecycle = new RunLifecycleService()
    const service = new TerminalSessionService(
      new NoopProcessPort(),
      undefined,
      lifecycle,
      undefined,
      provider
    )

    await service.initializeRuntime({ onOutput: () => undefined, onExit: () => undefined })
    const lease = await lifecycle.hardDisposeProject('/work/app')
    lease.release()

    expect(provider.retiredSessionIds).toEqual(['session-1'])
  })
})

class RecordingRuntimeProvider implements TerminalRuntimeProviderPort {
  private issueHandler: ((issue: TerminalRuntimeRecoveryIssue) => void) | null = null
  readonly retiredSessionIds: string[] = []
  initializeCount = 0

  constructor(
    private readonly recoveredSession: TerminalSessionSnapshot = warmSession(),
    private initializationFailures = 0
  ) {}

  async initialize() {
    this.initializeCount += 1
    if (this.initializationFailures > 0) {
      this.initializationFailures -= 1
      throw createExpectedAppError(
        'TERMINAL_PROVIDER_UNAVAILABLE',
        'Terminal provider is temporarily unavailable.'
      )
    }
    return { sessions: [this.recoveredSession], issues: [], managedServiceEndpoints: [] }
  }

  bindRecoveryIssueHandler(handler: (issue: TerminalRuntimeRecoveryIssue) => void): void {
    this.issueHandler = handler
  }

  bindRecoveredSession(): void {}
  async setRetentionPolicy(): Promise<void> {}
  async recordManagedServiceEndpoint(): Promise<void> {}
  async retireSession(identity: TerminalSessionSnapshot): Promise<void> {
    this.retiredSessionIds.push(identity.sessionId)
  }
  async detachApplication(): Promise<void> {}

  reportIssue(issue: TerminalRuntimeRecoveryIssue): void {
    this.issueHandler?.(issue)
  }
}

class NoopProcessPort implements TerminalProcessPort {
  async start(): Promise<{ readonly processId: number }> {
    return { processId: 101 }
  }
  write(): void {}
  resize(): void {}
  pauseOutput(): void {}
  resumeOutput(): void {}
  async readWorkingDirectory(): Promise<null> {
    return null
  }
  async stop(): Promise<void> {}
  async disposeAll(): Promise<void> {}
}

function warmSession(): TerminalSessionSnapshot {
  return {
    projectId: 'project-1',
    projectDirectory: '/work/app',
    workspaceId: 'main',
    workspaceDirectory: '/work/app',
    gitBranch: 'main',
    blockId: 'block-1',
    sessionId: 'session-1',
    runId: 'run-1',
    generation: 1,
    id: 'session-1',
    terminalBlockId: 'block-1',
    workingDirectory: '/work/app',
    processId: 4242,
    status: 'running',
    kind: 'interactive',
    retentionPolicy: 'keep-after-application-exit',
    recoveryKind: 'warm',
    terminalSourceTheme: 'dark',
    inputHistory: [],
    exitCode: null,
    failureReason: null
  }
}

function historicalSession(): TerminalSessionSnapshot {
  return {
    ...warmSession(),
    processId: null,
    status: 'exited',
    recoveryKind: 'historical'
  }
}
