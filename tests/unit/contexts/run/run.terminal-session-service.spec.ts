import { vi } from 'vitest'

import { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'
import type { TerminalProcessPort } from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import type { RunRuntimeScopeValidationPort } from '../../../../src/contexts/run/application/ports/RunRuntimeScopeValidationPort'

describe('terminal session service', () => {
  it('forwards output emitted before process startup returns', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort('startup output')
    const service = new TerminalSessionService(terminalProcessPort)
    const onOutput = vi.fn()

    await service.start({
      ...runOwner('/tmp/cleancode-demo', 'project-demo'),
      terminalBlockId: 'block-1',
      onOutput,
      onExit: () => undefined
    })

    expect(onOutput).toHaveBeenCalledWith(expect.objectContaining({ data: 'startup output' }))
  })

  it('interrupts a running terminal with Ctrl+C without exiting the session', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const service = new TerminalSessionService(terminalProcessPort)

    const session = await service.start({
      ...runOwner('/tmp/cleancode-demo', 'project-demo'),
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
      ...runOwner('/tmp/cleancode-demo', 'project-demo'),
      terminalBlockId: 'block-1',
      workspaceName: 'main',
      workingDirectory: '/tmp/cleancode-demo',
      shell: '/bin/sh',
      onOutput: () => undefined,
      onExit: () => undefined
    })
    const terminatedSession = await service.terminate(session.id)

    expect(terminatedSession?.status).toBe('exited')
    expect(terminatedSession?.exitCode).toBeNull()
    expect(terminalProcessPort.stoppedSessionIds).toEqual([session.id])
    expect(terminalProcessPort.writes).toEqual([])
  })

  it('treats terminating an absent terminal session as already completed', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const service = new TerminalSessionService(terminalProcessPort)

    await expect(service.terminate('missing-session')).resolves.toBeNull()
    expect(terminalProcessPort.stoppedSessionIds).toEqual([])
  })

  it('retains a failed snapshot when managed launch preparation rejects', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const service = new TerminalSessionService(terminalProcessPort)
    const preparationFailure = new Error('fixed service port is unavailable')
    let failedSessionId = ''

    await expect(
      service.start({
        ...runOwner('/work/app', 'project-app'),
        terminalBlockId: 'block-1',
        prepareLaunch: async (scope) => {
          failedSessionId = scope.sessionId
          throw preparationFailure
        },
        onOutput: () => undefined,
        onExit: () => undefined
      })
    ).rejects.toBe(preparationFailure)

    expect(service.getSession(failedSessionId)).toMatchObject({
      id: failedSessionId,
      status: 'failed',
      processId: null,
      failureReason: preparationFailure.message
    })
    await expect(service.terminate(failedSessionId)).resolves.toMatchObject({
      id: failedSessionId,
      status: 'failed'
    })

    const replacement = await service.start({
      ...runOwner('/work/app', 'project-app'),
      terminalBlockId: 'block-1',
      onOutput: () => undefined,
      onExit: () => undefined
    })

    expect(replacement.generation).toBe(2)
    expect(terminalProcessPort.starts).toHaveLength(1)
  })

  it('reports a failed terminal instead of pretending a process is running', async () => {
    const service = new TerminalSessionService(new FailingTerminalProcessPort())

    const session = await service.start({
      ...runOwner('/tmp/cleancode-demo', 'project-demo'),
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
      ...runOwner('/work/app', 'project-app'),
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
      ...runOwner('/work/app', 'project-app'),
      terminalBlockId: 'block-1',
      workspaceName: 'main',
      workingDirectory: '/work/app',
      shell: '/bin/sh',
      onOutput: () => undefined,
      onExit: () => undefined
    })

    terminalProcessPort.workingDirectories.set(session.id, '/work/app')
    await service.terminate(session.id)

    await expect(service.listWorkingDirectories([session.id])).resolves.toEqual([])
  })

  it('returns authoritative snapshots without forwarding stale actions after a session exits', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const service = new TerminalSessionService(terminalProcessPort)
    const session = await service.start({
      ...runOwner('/work/app', 'project-app'),
      terminalBlockId: 'block-1',
      onOutput: () => undefined,
      onExit: () => undefined
    })
    await service.terminate(session.id)

    expect(service.write(session.id, 'stale input').status).toBe('exited')
    expect(service.interrupt(session.id).status).toBe('exited')
    expect(service.resize(session.id, 120, 40).status).toBe('exited')
    expect(terminalProcessPort.writes).toEqual([])
    expect(terminalProcessPort.resizes).toEqual([])
  })

  it('lists retained session snapshots for renderer reconciliation', async () => {
    const service = new TerminalSessionService(new RecordingTerminalProcessPort())
    const session = await service.start({
      ...runOwner('/work/app', 'project-app'),
      terminalBlockId: 'block-1',
      onOutput: () => undefined,
      onExit: () => undefined
    })
    await service.terminate(session.id)

    expect(service.listSessions([session.id, 'missing-session'])).toEqual([
      expect.objectContaining({ id: session.id, status: 'exited' })
    ])
  })

  it('keeps terminal sessions in different workspaces independent', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const service = new TerminalSessionService(terminalProcessPort)
    const mainSession = await service.start({
      ...runOwner('/work/app', 'project-app'),
      terminalBlockId: 'block-1',
      workspaceName: 'main',
      workingDirectory: '/work/app',
      shell: '/bin/sh',
      onOutput: () => undefined,
      onExit: () => undefined
    })
    const featureSession = await service.start({
      ...runOwner('/work/app', 'project-app'),
      terminalBlockId: 'block-1',
      workspaceName: 'feature/sidebar',
      workspaceDirectory: '/work/app-sidebar',
      workingDirectory: '/work/app-sidebar',
      shell: '/bin/sh',
      onOutput: () => undefined,
      onExit: () => undefined
    })

    expect(mainSession.status).toBe('running')
    expect(featureSession.status).toBe('running')
    expect(terminalProcessPort.stoppedSessionIds).toEqual([])
  })

  it('keeps identical workspace and block identities independent across projects', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const service = new TerminalSessionService(terminalProcessPort)

    const firstProjectSession = await service.start({
      ...runOwner('/work/first', 'project-first'),
      terminalBlockId: 'block-1',
      onOutput: () => undefined,
      onExit: () => undefined
    })
    const secondProjectSession = await service.start({
      ...runOwner('/work/second', 'project-second'),
      terminalBlockId: 'block-1',
      onOutput: () => undefined,
      onExit: () => undefined
    })

    expect(firstProjectSession.projectId).toBe('project-first')
    expect(secondProjectSession.projectId).toBe('project-second')
    expect(firstProjectSession.runId).not.toBe(secondProjectSession.runId)
    expect(terminalProcessPort.stoppedSessionIds).toEqual([])
  })

  it('waits for the previous session to exit before replacing the exact slot', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    terminalProcessPort.deferStops = true
    const service = new TerminalSessionService(terminalProcessPort)
    const owner = runOwner('/work/app', 'project-app')
    const first = await service.start({
      ...owner,
      terminalBlockId: 'block-1',
      onOutput: () => undefined,
      onExit: () => undefined
    })

    let replacementSettled = false
    const replacement = service
      .start({
        ...owner,
        terminalBlockId: 'block-1',
        onOutput: () => undefined,
        onExit: () => undefined
      })
      .then((session) => {
        replacementSettled = true
        return session
      })

    await vi.waitFor(() => expect(terminalProcessPort.stoppedSessionIds).toEqual([first.id]))
    expect(replacementSettled).toBe(false)
    expect(terminalProcessPort.starts).toHaveLength(1)

    terminalProcessPort.completeStop(first.id)
    const second = await replacement

    expect(second.generation).toBe(first.generation + 1)
    expect(terminalProcessPort.starts).toHaveLength(2)
  })

  it('ignores output and exit callbacks from an older generation after replacement', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const service = new TerminalSessionService(terminalProcessPort)
    const outputEvents: string[] = []
    const exitEvents: string[] = []
    const owner = runOwner('/work/app', 'project-app')
    const first = await service.start({
      ...owner,
      terminalBlockId: 'block-1',
      onOutput: (event) => outputEvents.push(event.sessionId),
      onExit: (event) => exitEvents.push(event.sessionId)
    })
    const firstCallbacks = terminalProcessPort.starts[0]
    const second = await service.start({
      ...owner,
      terminalBlockId: 'block-1',
      onOutput: (event) => outputEvents.push(event.sessionId),
      onExit: (event) => exitEvents.push(event.sessionId)
    })

    firstCallbacks?.onOutput({ scope: first, sessionId: first.id, data: 'stale' })
    firstCallbacks?.onExit({ scope: first, sessionId: first.id, exitCode: 0 })

    expect(outputEvents).toEqual([])
    expect(exitEvents).toEqual([])
    expect(service.getSession(second.id)?.status).toBe('running')
  })

  it('validates the authoritative project workspace scope immediately before spawning a PTY', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const validation = new RecordingScopeValidationPort()
    const service = new TerminalSessionService(terminalProcessPort, validation)
    const owner = runOwner('/work/app', 'project-app')

    await service.start({
      ...owner,
      terminalBlockId: 'block-1',
      onOutput: () => undefined,
      onExit: () => undefined
    })

    expect(validation.commands).toEqual([
      {
        projectId: 'project-app',
        projectDirectory: '/work/app',
        workspaceName: 'main',
        workspaceDirectory: '/work/app',
        gitBranch: 'main'
      }
    ])
    expect(terminalProcessPort.starts).toHaveLength(1)
  })

  it('fails with a stable stale-scope error before spawning when Project rejects the scope', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const validation: RunRuntimeScopeValidationPort = {
      validate: async () => {
        throw new Error('project no longer owns this workspace')
      }
    }
    const service = new TerminalSessionService(terminalProcessPort, validation)

    await expect(
      service.start({
        ...runOwner('/work/app', 'project-app'),
        terminalBlockId: 'block-1',
        onOutput: () => undefined,
        onExit: () => undefined
      })
    ).rejects.toMatchObject({ code: 'RUN_SCOPE_STALE' })
    expect(terminalProcessPort.starts).toEqual([])
  })

  it('waits for every managed terminator and still disposes PTYs when shutdown cleanup fails', async () => {
    const terminalProcessPort = new RecordingTerminalProcessPort()
    const service = new TerminalSessionService(terminalProcessPort)
    const session = await service.start({
      ...runOwner('/work/app', 'project-app'),
      terminalBlockId: 'block-1',
      onOutput: () => undefined,
      onExit: () => undefined
    })
    const cleanupFailure = new Error('managed terminator failed')
    let finishPendingTermination: () => void = () => undefined
    const pendingTermination = new Promise<void>((resolve) => {
      finishPendingTermination = resolve
    })
    const failedTerminator = vi.fn(() => {
      throw cleanupFailure
    })
    const pendingTerminator = vi.fn(async () => pendingTermination)
    service.registerManagedTerminator('session-1', failedTerminator)
    service.registerManagedTerminator('session-2', pendingTerminator)

    let cleanupSettled = false
    const cleanup = service.stopAll().finally(() => {
      cleanupSettled = true
    })
    void cleanup.catch(() => undefined)

    await vi.waitFor(() => {
      expect(failedTerminator).toHaveBeenCalledOnce()
      expect(pendingTerminator).toHaveBeenCalledOnce()
    })
    expect(cleanupSettled).toBe(false)
    expect(terminalProcessPort.disposeAllCalls).toBe(0)

    finishPendingTermination()
    await expect(cleanup).rejects.toBe(cleanupFailure)
    expect(terminalProcessPort.disposeAllCalls).toBe(1)
    expect(service.getSession(session.id)?.status).toBe('exited')
  })
})

class RecordingTerminalProcessPort implements TerminalProcessPort {
  readonly writes: Array<{ readonly sessionId: string; readonly input: string }> = []
  readonly resizes: Array<{
    readonly sessionId: string
    readonly columns: number
    readonly rows: number
  }> = []
  readonly stoppedSessionIds: string[] = []
  readonly workingDirectories = new Map<string, string>()
  readonly starts: Parameters<TerminalProcessPort['start']>[0][] = []
  disposeAllCalls = 0
  deferStops = false
  private readonly pendingStops = new Map<string, () => void>()

  constructor(private readonly outputOnStart?: string) {}

  async start(
    command: Parameters<TerminalProcessPort['start']>[0]
  ): Promise<{ readonly processId: number }> {
    this.starts.push(command)
    if (this.outputOnStart) {
      command.onOutput({
        scope: command.scope,
        sessionId: command.scope.sessionId,
        data: this.outputOnStart
      })
    }
    return { processId: 101 }
  }

  write(sessionId: string, input: string): void {
    this.writes.push({ sessionId, input })
  }

  resize(sessionId: string, columns: number, rows: number): void {
    this.resizes.push({ sessionId, columns, rows })
  }

  pauseOutput(): void {}

  resumeOutput(): void {}

  async stop(sessionId: string): Promise<void> {
    this.stoppedSessionIds.push(sessionId)
    if (this.deferStops) {
      await new Promise<void>((resolve) => this.pendingStops.set(sessionId, resolve))
    }
  }

  async readWorkingDirectory(sessionId: string): Promise<string | null> {
    return this.workingDirectories.get(sessionId) ?? null
  }

  async disposeAll(): Promise<void> {
    this.disposeAllCalls += 1
  }

  completeStop(sessionId: string): void {
    this.pendingStops.get(sessionId)?.()
    this.pendingStops.delete(sessionId)
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

  pauseOutput(): void {}

  resumeOutput(): void {}

  async stop(): Promise<void> {
    return undefined
  }

  async readWorkingDirectory(): Promise<string | null> {
    return null
  }

  async disposeAll(): Promise<void> {
    return undefined
  }
}

function runOwner(projectDirectory: string, projectId: string) {
  return {
    projectId,
    projectDirectory,
    workspaceName: 'main',
    workspaceDirectory: projectDirectory,
    gitBranch: 'main',
    workingDirectory: projectDirectory,
    shell: '/bin/sh'
  }
}

class RecordingScopeValidationPort implements RunRuntimeScopeValidationPort {
  readonly commands: Parameters<RunRuntimeScopeValidationPort['validate']>[0][] = []

  async validate(command: Parameters<RunRuntimeScopeValidationPort['validate']>[0]): Promise<void> {
    this.commands.push(command)
  }
}
