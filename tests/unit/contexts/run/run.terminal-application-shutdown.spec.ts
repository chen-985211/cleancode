import { vi } from 'vitest'

import type { TerminalRuntimeProviderPort } from '../../../../src/contexts/run/application/ports/TerminalRuntimeProviderPort'
import type { TerminalProcessPort } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'

describe('terminal application shutdown', () => {
  it('hands PTY cleanup to the Provider once without stopping or retiring sessions individually', async () => {
    const processes = new RecordingTerminalProcessPort()
    const provider = new RecordingTerminalRuntimeProvider()
    const sessions = new TerminalSessionService(
      processes,
      undefined,
      undefined,
      undefined,
      provider
    )
    const first = await sessions.start({
      ...runOwner('block-1'),
      onExit: () => undefined,
      onOutput: () => undefined
    })
    const retained = await sessions.start({
      ...runOwner('block-2'),
      onExit: () => undefined,
      onOutput: () => undefined
    })
    await sessions.setRetentionPolicy(retained.id, 'keep-after-application-exit')

    await sessions.prepareApplicationShutdown()

    expect(first.retentionPolicy).toBe('terminate-on-application-exit')
    expect(processes.stoppedSessionIds).toEqual([])
    expect(provider.retiredSessionIds).toEqual([])
    expect(provider.detachApplication).toHaveBeenCalledOnce()
  })
})

class RecordingTerminalProcessPort implements TerminalProcessPort {
  readonly stoppedSessionIds: string[] = []
  private nextProcessId = 100

  async start(): Promise<{ readonly processId: number }> {
    this.nextProcessId += 1
    return { processId: this.nextProcessId }
  }

  write(): void {}

  resize(): void {}

  pauseOutput(): void {}

  resumeOutput(): void {}

  async stop(sessionId: string): Promise<void> {
    this.stoppedSessionIds.push(sessionId)
  }

  async readWorkingDirectory(): Promise<string | null> {
    return null
  }

  async disposeAll(): Promise<void> {}
}

class RecordingTerminalRuntimeProvider implements TerminalRuntimeProviderPort {
  readonly detachApplication = vi.fn(async () => undefined)
  readonly retiredSessionIds: string[] = []

  async initialize() {
    return { sessions: [], issues: [], managedServiceEndpoints: [] }
  }

  bindRecoveredSession(): void {}

  async setRetentionPolicy(): Promise<void> {}

  async recordManagedServiceEndpoint(): Promise<void> {}

  async retireSession(identity: Parameters<TerminalRuntimeProviderPort['retireSession']>[0]) {
    this.retiredSessionIds.push(identity.sessionId)
  }
}

function runOwner(blockId: string) {
  return {
    blockId,
    gitBranch: 'main',
    projectDirectory: '/project',
    projectId: 'project-1',
    terminalBlockId: blockId,
    workspaceDirectory: '/project',
    workspaceName: 'main',
    workingDirectory: '/project'
  }
}
