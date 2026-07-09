import { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'
import type { TerminalProcessPort } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'

describe('terminal session service', () => {
  it('interrupts a running terminal with Ctrl+C without exiting the session', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const service = new TerminalSessionService(terminalProcessPort)

    const session = await service.start({
      terminalBlockId: 'block-1',
      workspaceName: 'main',
      workingDirectory: '/tmp/cleancode-demo',
      shell: '/bin/sh',
      onOutput: () => undefined,
      onExit: () => undefined
    })
    const interruptedSession = service.interrupt(session.id)

    expect(interruptedSession.status).toBe('running')
    expect(interruptedSession.processId).toBe(101)
    expect(terminalProcessPort.writes).toEqual([{ sessionId: session.id, input: '\x03' }])
    expect(terminalProcessPort.stoppedSessionIds).toEqual([])
  })

  it('terminates a running terminal process when closing the terminal session', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const service = new TerminalSessionService(terminalProcessPort)

    const session = await service.start({
      terminalBlockId: 'block-1',
      workspaceName: 'main',
      workingDirectory: '/tmp/cleancode-demo',
      shell: '/bin/sh',
      onOutput: () => undefined,
      onExit: () => undefined
    })
    const terminatedSession = service.terminate(session.id)

    expect(terminatedSession.status).toBe('exited')
    expect(terminatedSession.exitCode).toBeNull()
    expect(terminalProcessPort.stoppedSessionIds).toEqual([session.id])
    expect(terminalProcessPort.writes).toEqual([])
  })

  it('reports a failed terminal instead of pretending a process is running', async () => {
    const service = new TerminalSessionService(new FailingTerminalProcessPort())

    const session = await service.start({
      terminalBlockId: 'block-1',
      workspaceName: 'main',
      workingDirectory: '/tmp/cleancode-demo',
      shell: '/bin/sh',
      onOutput: () => undefined,
      onExit: () => undefined
    })

    expect(session.status).toBe('failed')
    expect(session.processId).toBeNull()
    expect(session.failureReason).toBe('PTY unavailable')
  })

  it('lists current working directories for running terminal sessions', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const service = new TerminalSessionService(terminalProcessPort)
    const session = await service.start({
      terminalBlockId: 'block-1',
      workspaceName: 'main',
      workingDirectory: '/work/app',
      shell: '/bin/sh',
      onOutput: () => undefined,
      onExit: () => undefined
    })

    terminalProcessPort.workingDirectories.set(session.id, '/work/app-worktree/src')

    await expect(service.listWorkingDirectories([session.id, 'missing-session'])).resolves.toEqual([
      {
        sessionId: session.id,
        workingDirectory: '/work/app-worktree/src'
      }
    ])
  })

  it('does not list working directories for exited terminal sessions', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const service = new TerminalSessionService(terminalProcessPort)
    const session = await service.start({
      terminalBlockId: 'block-1',
      workspaceName: 'main',
      workingDirectory: '/work/app',
      shell: '/bin/sh',
      onOutput: () => undefined,
      onExit: () => undefined
    })

    terminalProcessPort.workingDirectories.set(session.id, '/work/app')
    service.terminate(session.id)

    await expect(service.listWorkingDirectories([session.id])).resolves.toEqual([])
  })

  it('keeps terminal sessions in different workspaces independent', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const service = new TerminalSessionService(terminalProcessPort)
    const mainSession = await service.start({
      terminalBlockId: 'block-1',
      workspaceName: 'main',
      workingDirectory: '/work/app',
      shell: '/bin/sh',
      onOutput: () => undefined,
      onExit: () => undefined
    })
    const featureSession = await service.start({
      terminalBlockId: 'block-1',
      workspaceName: 'feature/sidebar',
      workingDirectory: '/work/app-sidebar',
      shell: '/bin/sh',
      onOutput: () => undefined,
      onExit: () => undefined
    })

    expect(mainSession.status).toBe('running')
    expect(featureSession.status).toBe('running')
    expect(terminalProcessPort.stoppedSessionIds).toEqual([])
  })
})

class RecordingTerminalProcessPort implements TerminalProcessPort {
  readonly writes: Array<{ readonly sessionId: string; readonly input: string }> = []
  readonly stoppedSessionIds: string[] = []
  readonly workingDirectories = new Map<string, string>()

  async start(): Promise<{ readonly processId: number }> {
    return { processId: 101 }
  }

  write(sessionId: string, input: string): void {
    this.writes.push({ sessionId, input })
  }

  resize(): void {
    return undefined
  }

  stop(sessionId: string): void {
    this.stoppedSessionIds.push(sessionId)
  }

  async readWorkingDirectory(sessionId: string): Promise<string | null> {
    return this.workingDirectories.get(sessionId) ?? null
  }

  disposeAll(): void {
    return undefined
  }
}

class FailingTerminalProcessPort implements TerminalProcessPort {
  async start(): Promise<never> {
    throw new Error('PTY unavailable')
  }

  write(): void {
    throw new Error('Terminal process was not started.')
  }

  resize(): void {
    throw new Error('Terminal process was not started.')
  }

  stop(): void {
    return undefined
  }

  async readWorkingDirectory(): Promise<string | null> {
    return null
  }

  disposeAll(): void {
    return undefined
  }
}
