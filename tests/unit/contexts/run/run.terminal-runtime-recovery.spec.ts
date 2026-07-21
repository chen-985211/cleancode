import type { TerminalSessionSnapshot } from '../../../../src/contexts/run/application/dto/TerminalSessionSnapshot'
import type { TerminalProcessPort } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import type {
  TerminalRuntimeProviderPort,
  TerminalRuntimeRecoveryIssue
} from '../../../../src/contexts/run/application/ports/TerminalRuntimeProviderPort'
import { RunLifecycleService } from '../../../../src/contexts/run/application/use-cases/RunLifecycleService'
import { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'

describe('terminal runtime recovery', () => {
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

  constructor(private readonly recoveredSession: TerminalSessionSnapshot = warmSession()) {}

  async initialize() {
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
    workspaceName: 'main',
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
