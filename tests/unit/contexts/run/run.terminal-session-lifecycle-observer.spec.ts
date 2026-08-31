import type { TerminalProcessPort } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import type { TerminalSessionLifecycleObserverPort } from '../../../../src/contexts/run/application/ports/TerminalSessionLifecycleObserverPort'
import { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'

describe('terminal session lifecycle observer', () => {
  it('reports accepted terminal output sequence without changing output delivery', async () => {
    const terminalProcessPort = new LifecycleTerminalProcessPort()
    const onOutput = vi.fn()
    const terminalOutputAccepted = vi.fn<
      NonNullable<TerminalSessionLifecycleObserverPort['terminalOutputAccepted']>
    >(() => {
      throw new Error('observer failure')
    })
    const service = new TerminalSessionService(
      terminalProcessPort,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { terminalEnded: vi.fn(), terminalOutputAccepted }
    )
    const session = await service.start({
      projectDirectory: '/project',
      projectId: 'project-1',
      workspaceDirectory: '/project',
      workspaceId: 'main',
      gitBranch: 'main',
      terminalBlockId: 'block-1',
      workingDirectory: '/project',
      onOutput,
      onExit: () => undefined
    })

    terminalProcessPort.emitOutput(session.id, 'tail')

    expect(terminalOutputAccepted).toHaveBeenCalledWith(
      expect.objectContaining({
        generation: session.generation,
        runId: session.runId,
        sessionId: session.sessionId
      }),
      1
    )
    expect(onOutput).toHaveBeenCalledWith(
      expect.objectContaining({ data: 'tail', sequence: 1, sessionId: session.sessionId })
    )
  })

  it('reports a terminal generation exactly once when its runtime ends', async () => {
    const terminalProcessPort = new LifecycleTerminalProcessPort()
    const terminalEnded = vi.fn<TerminalSessionLifecycleObserverPort['terminalEnded']>()
    const service = new TerminalSessionService(
      terminalProcessPort,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { terminalEnded }
    )
    const session = await service.start({
      projectDirectory: '/project',
      projectId: 'project-1',
      workspaceDirectory: '/project',
      workspaceId: 'main',
      gitBranch: 'main',
      terminalBlockId: 'block-1',
      workingDirectory: '/project',
      onOutput: () => undefined,
      onExit: () => undefined
    })

    await service.terminate(session.id)
    terminalProcessPort.emitExit(session.id, 0)

    expect(terminalEnded).toHaveBeenCalledTimes(1)
    expect(terminalEnded).toHaveBeenCalledWith(
      expect.objectContaining({
        generation: session.generation,
        runId: session.runId,
        sessionId: session.sessionId
      })
    )
  })
})

class LifecycleTerminalProcessPort implements TerminalProcessPort {
  private startCommand: Parameters<TerminalProcessPort['start']>[0] | null = null

  async start(command: Parameters<TerminalProcessPort['start']>[0]) {
    this.startCommand = command
    return { processId: 101 }
  }

  write(): void {}
  resize(): void {}
  pauseOutput(): void {}
  resumeOutput(): void {}
  stop(): Promise<void> {
    return Promise.resolve()
  }
  readWorkingDirectory(): Promise<string | null> {
    return Promise.resolve(null)
  }
  disposeAll(): Promise<void> {
    return Promise.resolve()
  }

  emitExit(sessionId: string, exitCode: number | null): void {
    const command = this.startCommand
    if (command?.scope.sessionId === sessionId) {
      command.onExit({ exitCode, scope: command.scope, sessionId })
    }
  }

  emitOutput(sessionId: string, data: string): void {
    const command = this.startCommand
    if (command?.scope.sessionId === sessionId) {
      command.onOutput({ data, scope: command.scope, sessionId })
    }
  }
}
