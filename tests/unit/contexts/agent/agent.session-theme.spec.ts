import type {
  AgentMcpRegistration,
  AgentMcpServerPort,
  RegisteredAgentMcpSession
} from '../../../../src/contexts/agent/application/ports/AgentMcpServerPort'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import type { AgentTerminalSourceTheme } from '../../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import type {
  AgentTerminalRuntimePort,
  OpenAgentTerminalCommand
} from '../../../../src/contexts/agent/application/ports/AgentTerminalRuntimePort'
import { RecordingAgentProviderRegistry } from '../../../fixtures/agentTerminalRuntime'
import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import type { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'

describe('agent session terminal source theme', () => {
  it('keeps the first terminal source theme when a running session is reattached', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const service = createSessionService(processPort, new EmptyAgentSessionRepository())

    const firstSession = await attachSession(service, { terminalSourceTheme: 'light' })
    const reattachedSession = await attachSession(service, { terminalSourceTheme: 'dark' })

    expect(firstSession).toMatchObject({ terminalSourceTheme: 'light' })
    expect(reattachedSession).toMatchObject({
      runtime: { terminal: { processId: firstSession.runtime.terminal.processId } },
      sessionId: firstSession.sessionId,
      terminalSourceTheme: 'light'
    })
    expect(processPort.starts).toHaveLength(1)
  })

  it('serializes concurrent first attaches and lets the second attachment own callbacks', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const repository = new GatedEmptyAgentSessionRepository()
    const service = createSessionService(processPort, repository)
    const firstExit: number[] = []
    const secondExit: number[] = []

    const firstAttach = attachSession(service, {
      onRuntimeChanged: (event) => {
        if (event.runtime.terminal.status === 'exited') {
          firstExit.push(event.runtime.terminal.exitCode ?? -1)
        }
      },
      terminalSourceTheme: 'light'
    })
    await repository.lookupStarted.promise
    const secondAttach = attachSession(service, {
      onRuntimeChanged: (event) => {
        if (event.runtime.terminal.status === 'exited') {
          secondExit.push(event.runtime.terminal.exitCode ?? -1)
        }
      },
      terminalSourceTheme: 'dark'
    })
    repository.release()

    const [firstSession, secondSession] = await Promise.all([firstAttach, secondAttach])

    expect(processPort.starts).toHaveLength(1)
    expect(secondSession).toMatchObject({
      sessionId: firstSession.sessionId,
      terminalSourceTheme: 'light'
    })

    processPort.starts[0]?.onTerminalExit(0)
    expect(firstExit).toEqual([])
    expect(secondExit).toEqual([0])
  })

  it('serializes different branch scopes that share one physical Agent runtime owner', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const repository = new GatedEmptyAgentSessionRepository()
    const service = createSessionService(processPort, repository)

    const mainAttach = attachSession(service, {
      gitBranch: 'main',
      terminalSourceTheme: 'light'
    })
    await repository.lookupStarted.promise
    const featureAttach = attachSession(service, {
      gitBranch: 'feature/theme',
      terminalSourceTheme: 'dark'
    })
    repository.release()

    const [mainSession, featureSession] = await Promise.all([mainAttach, featureAttach])

    expect(featureSession.sessionId).not.toBe(mainSession.sessionId)
    expect(processPort.starts).toHaveLength(2)
    expect(processPort.stops).toEqual([mainSession.sessionId])

    const reattachedFeature = await attachSession(service, {
      gitBranch: 'feature/theme',
      terminalSourceTheme: 'light'
    })
    expect(reattachedFeature.sessionId).toBe(featureSession.sessionId)
    expect(processPort.starts).toHaveLength(2)
  })

  it('disposes an attach that was still reading its persisted session', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const repository = new GatedEmptyAgentSessionRepository()
    const service = createSessionService(processPort, repository)

    const pendingAttach = attachSession(service, { terminalSourceTheme: 'light' })
    await repository.lookupStarted.promise
    const pendingDispose = service.disposeSession({
      projectDirectory: '/repo/app',
      workspaceName: 'main'
    })
    const staleAttach = attachSession(service, { terminalSourceTheme: 'dark' })
    await expect(staleAttach).rejects.toMatchObject({ code: 'AGENT_SESSION_NOT_FOUND' })
    repository.release()

    const session = await pendingAttach
    const disposal = await pendingDispose

    expect(processPort.stops).toEqual([session.sessionId])
    await expect(attachSession(service, { terminalSourceTheme: 'dark' })).rejects.toMatchObject({
      code: 'AGENT_SESSION_NOT_FOUND'
    })
    disposal.release()
    const replacement = await attachSession(service, { terminalSourceTheme: 'dark' })
    expect(replacement.sessionId).not.toBe(session.sessionId)
  })

  it('suspends an attach that was still reading its persisted session', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const repository = new GatedEmptyAgentSessionRepository()
    const service = createSessionService(processPort, repository)

    const pendingAttach = attachSession(service, { terminalSourceTheme: 'light' })
    await repository.lookupStarted.promise
    const pendingSuspend = service.suspendWorkspaceDirectory('/repo/app')
    repository.release()

    const session = await pendingAttach
    const suspension = await pendingSuspend
    expect(suspension.wasSuspended).toBe(true)
    expect(processPort.stops).toEqual([session.sessionId])
    await expect(attachSession(service, { terminalSourceTheme: 'dark' })).rejects.toMatchObject({
      code: 'AGENT_SESSION_NOT_FOUND'
    })

    await suspension.resume()
    suspension.release()
    expect(processPort.starts).toHaveLength(2)
  })

  it('rejects an MCP restart while a workspace suspension lease is active', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const service = createSessionService(processPort, new EmptyAgentSessionRepository())

    await attachSession(service, { terminalSourceTheme: 'light' })
    const suspension = await service.suspendWorkspaceDirectory('/repo/app')

    await expect(
      service.reconfigureAgent({
        agentId: 'agent-1',
        cleancodeMcpEnabled: false,
        projectId: 'project-1',
        workspaceName: 'main'
      })
    ).rejects.toMatchObject({ code: 'AGENT_SESSION_NOT_FOUND' })
    expect(processPort.starts).toHaveLength(1)

    suspension.release()
  })

  it('serializes overlapping workspace lifecycle leases until the first transaction releases', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const service = createSessionService(processPort, new EmptyAgentSessionRepository())

    await attachSession(service, { terminalSourceTheme: 'light' })
    const firstSuspension = await service.suspendWorkspaceDirectory('/repo/app')
    let secondLeaseAcquired = false
    const secondSuspensionPromise = service.suspendWorkspaceDirectory('/repo/app').then((lease) => {
      secondLeaseAcquired = true
      return lease
    })

    await Promise.resolve()
    expect(secondLeaseAcquired).toBe(false)

    firstSuspension.release()
    const secondSuspension = await secondSuspensionPromise
    expect(secondLeaseAcquired).toBe(true)
    secondSuspension.release()
  })

  it('keeps workspace quarantines isolated and resolves only the retried workspace', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const service = createSessionService(processPort, new EmptyAgentSessionRepository())
    await attachSession(service, { terminalSourceTheme: 'light' })
    await attachSession(service, {
      terminalSourceTheme: 'dark',
      workspaceDirectory: '/repo/feature',
      workspaceName: 'feature/theme'
    })

    const mainLease = await service.disposeSession({
      projectDirectory: '/repo/app',
      workspaceName: 'main'
    })
    mainLease.quarantine()
    const featureLease = await service.disposeSession({
      projectDirectory: '/repo/app',
      workspaceName: 'feature/theme'
    })
    featureLease.release()

    await expect(attachSession(service, { terminalSourceTheme: 'dark' })).rejects.toMatchObject({
      code: 'AGENT_SESSION_NOT_FOUND'
    })
    const recoveryLease = await service.disposeSession({
      projectDirectory: '/repo/app',
      workspaceName: 'main'
    })
    expect(recoveryLease.wasQuarantined).toBe(true)
    recoveryLease.resolve()

    await expect(attachSession(service, { terminalSourceTheme: 'dark' })).resolves.toMatchObject({
      workspaceName: 'main'
    })
  })

  it('resolves every workspace quarantine only through the project-wide lifecycle lease', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const service = createSessionService(processPort, new EmptyAgentSessionRepository())
    await attachSession(service, { terminalSourceTheme: 'light' })
    await attachSession(service, {
      terminalSourceTheme: 'dark',
      workspaceDirectory: '/repo/feature',
      workspaceName: 'feature/theme'
    })

    const mainLease = await service.disposeSession({
      projectDirectory: '/repo/app',
      workspaceName: 'main'
    })
    mainLease.quarantine()
    const featureLease = await service.disposeSession({
      projectDirectory: '/repo/app',
      workspaceName: 'feature/theme'
    })
    featureLease.quarantine()

    const projectLease = await service.disposeProject('/repo/app')
    expect(projectLease.wasQuarantined).toBe(true)
    projectLease.resolve()

    await expect(attachSession(service, { terminalSourceTheme: 'light' })).resolves.toBeDefined()
    await expect(
      attachSession(service, {
        terminalSourceTheme: 'dark',
        workspaceDirectory: '/repo/feature',
        workspaceName: 'feature/theme'
      })
    ).resolves.toBeDefined()
  })

  it('releases queued lifecycle leases and quarantines when the service stops', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const service = createSessionService(processPort, new EmptyAgentSessionRepository())
    await attachSession(service, { terminalSourceTheme: 'light' })
    const quarantined = await service.disposeSession({
      projectDirectory: '/repo/app',
      workspaceName: 'main'
    })
    quarantined.quarantine()
    const held = await service.disposeSession({
      projectDirectory: '/repo/app',
      workspaceName: 'main'
    })
    const waiting = service.disposeSession({
      projectDirectory: '/repo/app',
      workspaceName: 'main'
    })

    const shutdown = service.disposeAll()
    await expect(waiting).rejects.toMatchObject({ code: 'AGENT_SESSION_NOT_FOUND' })
    await shutdown
    held.release()
  })

  it('does not expose a false running session when resume cannot start Codex', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const service = createSessionService(processPort, new EmptyAgentSessionRepository())
    const firstSession = await attachSession(service, { terminalSourceTheme: 'light' })
    const suspension = await service.suspendWorkspaceDirectory('/repo/app')
    processPort.failStartAt = 2

    await expect(suspension.resume()).rejects.toThrow('start failed')
    suspension.release()
    processPort.failStartAt = null

    const replacement = await attachSession(service, { terminalSourceTheme: 'dark' })
    expect(replacement.sessionId).not.toBe(firstSession.sessionId)
    expect(processPort.starts).toHaveLength(3)
  })

  it('rolls a failed suspend back to a reusable running process', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const service = createSessionService(processPort, new EmptyAgentSessionRepository())
    const firstSession = await attachSession(service, { terminalSourceTheme: 'light' })
    processPort.stopError = new Error('stop failed')

    await expect(service.suspendWorkspaceDirectory('/repo/app')).rejects.toThrow('stop failed')
    processPort.stopError = null

    const reattached = await attachSession(service, { terminalSourceTheme: 'dark' })
    expect(reattached.sessionId).toBe(firstSession.sessionId)
    expect(processPort.starts).toHaveLength(1)
  })

  it('drains a pending attach before permanently disposing all runtimes', async () => {
    const processPort = new RecordingCodexAgentProcessPort()
    const repository = new GatedEmptyAgentSessionRepository()
    const service = createSessionService(processPort, repository)

    const pendingAttach = attachSession(service, { terminalSourceTheme: 'light' })
    await repository.lookupStarted.promise
    const pendingDisposeAll = service.disposeAll()
    repository.release()

    const session = await pendingAttach
    await pendingDisposeAll

    expect(processPort.events).toEqual([`start:${session.sessionId}`, 'dispose-all'])
    await expect(attachSession(service, { terminalSourceTheme: 'dark' })).rejects.toMatchObject({
      code: 'AGENT_SESSION_NOT_FOUND'
    })
  })
})

function createSessionService(
  processPort: AgentTerminalRuntimePort,
  repository: AgentSessionRepository
): AgentSessionService {
  return new AgentSessionService(
    processPort,
    new NoopAgentMcpServerPort(),
    {
      cancel: async () => {
        throw new Error('Agent tools are not used by these tests.')
      },
      execute: async () => {
        throw new Error('Agent tools are not used by these tests.')
      }
    },
    repository,
    new RecordingAgentProviderRegistry(),
    'codex'
  )
}

function attachSession(
  service: AgentSessionService,
  input: {
    readonly agentId?: string
    readonly gitBranch?: string
    readonly onRuntimeChanged?: Parameters<AgentSessionService['attach']>[0]['onRuntimeChanged']
    readonly terminalSourceTheme: AgentTerminalSourceTheme
    readonly workspaceDirectory?: string
    readonly workspaceName?: string
  }
): ReturnType<AgentSessionService['attach']> {
  const command = {
    agentId: input.agentId ?? 'agent-1',
    columns: 80,
    gitBranch: input.gitBranch,
    onGraphUpdated: () => undefined,
    onRuntimeChanged: input.onRuntimeChanged ?? (() => undefined),
    onToolApprovalRequested: () => undefined,
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    rows: 24,
    terminalSourceTheme: input.terminalSourceTheme,
    workspaceDirectory: input.workspaceDirectory ?? '/repo/app',
    workspaceName: input.workspaceName ?? 'main'
  } satisfies Parameters<AgentSessionService['attach']>[0] & {
    readonly terminalSourceTheme: AgentTerminalSourceTheme
  }

  return service.attach(command)
}

class RecordingCodexAgentProcessPort implements AgentTerminalRuntimePort {
  readonly events: string[] = []
  readonly starts: OpenAgentTerminalCommand[] = []
  readonly stops: string[] = []
  failStartAt: number | null = null
  stopError: Error | null = null

  open(
    command: OpenAgentTerminalCommand
  ): Promise<{ readonly processId: number; readonly terminalId: string }> {
    this.events.push(`start:${command.sessionId}`)
    this.starts.push(command)
    if (this.failStartAt === this.starts.length) return Promise.reject(new Error('start failed'))
    return Promise.resolve({
      processId: this.starts.length,
      terminalId: `terminal-${this.starts.length}`
    })
  }

  launch(command: Parameters<AgentTerminalRuntimePort['launch']>[0]) {
    const generation = this.starts.length
    const launchId = `launch-${generation}`
    command.onStarted?.({ generation, launchId })
    return { generation, launchId }
  }

  write(): void {}

  resize(): void {}

  stop(sessionId: string): Promise<void> {
    this.events.push(`stop:${sessionId}`)
    this.stops.push(sessionId)
    if (this.stopError) return Promise.reject(this.stopError)
    return Promise.resolve()
  }

  disposeAll(): Promise<void> {
    this.events.push('dispose-all')
    return Promise.resolve()
  }
}

class NoopAgentMcpServerPort implements AgentMcpServerPort {
  registerSession(session: RegisteredAgentMcpSession): Promise<AgentMcpRegistration> {
    return Promise.resolve({
      bearerToken: `token-${session.sessionId}`,
      dispose: () => undefined,
      url: `http://127.0.0.1/${session.sessionId}`
    })
  }

  dispose(): void {}
}

class EmptyAgentSessionRepository implements AgentSessionRepository {
  find(): Promise<AgentSession | null> {
    return Promise.resolve(null)
  }

  findAgent(): Promise<AgentSession | null> {
    return Promise.resolve(null)
  }

  findWorkspace(): Promise<readonly AgentSession[]> {
    return Promise.resolve([])
  }

  save(): Promise<void> {
    return Promise.resolve()
  }

  delete(): Promise<void> {
    return Promise.resolve()
  }

  deleteAgent(): Promise<void> {
    return Promise.resolve()
  }

  deleteProject(): Promise<void> {
    return Promise.resolve()
  }
}

class GatedEmptyAgentSessionRepository extends EmptyAgentSessionRepository {
  readonly lookupStarted = createDeferred<void>()
  private readonly lookupResult = createDeferred<AgentSession | null>()

  override find(): Promise<AgentSession | null> {
    this.lookupStarted.resolve()
    return this.lookupResult.promise
  }

  release(): void {
    this.lookupResult.resolve(null)
  }
}

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}
