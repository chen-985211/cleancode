import { vi } from 'vitest'

import { ManagedServiceLauncher } from '../../../../src/contexts/run/application/services/ManagedServiceLauncher'
import { LocalPortAllocator } from '../../../../src/contexts/run/application/services/LocalPortAllocator'
import type { LocalPortReservationPort } from '../../../../src/contexts/run/application/ports/LocalPortReservationPort'
import type { TcpListenerInspectionPort } from '../../../../src/contexts/run/application/ports/TcpListenerInspectionPort'
import type { TcpReadinessPort } from '../../../../src/contexts/run/application/ports/TcpReadinessPort'
import type {
  StartTerminalProcessCommand,
  TerminalProcessPort
} from '../../../../src/contexts/run/application/ports/TerminalProcessPort'
import { RunLifecycleService } from '../../../../src/contexts/run/application/use-cases/RunLifecycleService'
import { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'
import { ServicePortLeaseRegistry } from '../../../../src/contexts/run/domain/services/ServicePortLeaseRegistry'

describe('managed service launcher', () => {
  it('injects the allocated preferred fallback and proves ownership at the actual endpoint', async () => {
    const fixture = createFixture({
      reservations: [null, 41_001],
      inspections: [{ ownership: 'owned', listenerProcessId: 201 }]
    })
    const startedSessions: string[] = []

    const run = await fixture.launcher.launch({
      ...launchCommand(),
      portIntent: preferredPort(),
      onSessionStarted: (session) => startedSessions.push(session.id)
    })

    expect(run.endpoint).toMatchObject({ port: 41_001, requestedPort: 3_000, fallback: true })
    expect(fixture.processes.starts[0]?.environment).toMatchObject({ PORT: '41001' })
    expect(fixture.readiness.readyCommands).toEqual([
      expect.objectContaining({ host: '127.0.0.1', port: 41_001 })
    ])
    expect(fixture.inspector.commands).toEqual([
      { host: '127.0.0.1', port: 41_001, rootProcessId: 201 }
    ])
    expect(run.lease.state).toBe('bound')
    expect(startedSessions).toEqual([run.session.id])
  })

  it('quarantines the lease when the OS reservation cannot be released safely', async () => {
    const fixture = createFixture({
      reservations: [41_001],
      inspections: [],
      reservationReleaseFailure: true
    })

    await expect(
      fixture.launcher.launch({ ...launchCommand(), portIntent: preferredPort() })
    ).rejects.toMatchObject({ code: 'SERVICE_PORT_CLEANUP_FAILED' })
    expect(fixture.processes.starts).toEqual([])
    expect(fixture.registry.findActiveByPort(41_001)?.state).toBe('quarantined')
  })

  it('publishes the actual endpoint only after ownership is proven and the lease is bound', async () => {
    const inspectionGate = deferred<void>()
    const fixture = createFixture({
      reservations: [41_001],
      inspections: [{ ownership: 'owned', listenerProcessId: 201 }],
      inspectionGate
    })
    const startedSessions: string[] = []
    const confirmedEndpoints: Array<{ readonly port: number; readonly leaseState: string | null }> =
      []

    const launching = fixture.launcher.launch({
      ...launchCommand(),
      portIntent: preferredPort(),
      onSessionStarted: (session) => startedSessions.push(session.id),
      onEndpointConfirmed: (_session, endpoint) =>
        confirmedEndpoints.push({
          port: endpoint.port,
          leaseState: fixture.registry.findActiveByPort(endpoint.port)?.state ?? null
        })
    })

    await vi.waitFor(() => expect(fixture.inspector.commands).toHaveLength(1))
    expect(startedSessions).toHaveLength(1)
    expect(confirmedEndpoints).toEqual([])
    inspectionGate.resolve()

    const run = await launching
    expect(run.lease.state).toBe('bound')
    expect(confirmedEndpoints).toEqual([{ port: 41_001, leaseState: 'bound' }])
  })

  it('cleans up a bound run when endpoint publication fails', async () => {
    const fixture = createFixture({
      reservations: [41_001],
      inspections: [{ ownership: 'owned', listenerProcessId: 201 }]
    })

    await expect(
      fixture.launcher.launch({
        ...launchCommand(),
        portIntent: preferredPort(),
        onEndpointConfirmed: () => {
          throw new Error('endpoint publisher unavailable')
        }
      })
    ).rejects.toThrow('endpoint publisher unavailable')
    expect(fixture.processes.stops).toHaveLength(1)
    expect(fixture.registry.findActiveByPort(41_001)).toBeNull()
  })

  it('retries a preferred activation when the first ready listener belongs to another process', async () => {
    const fixture = createFixture({
      reservations: [41_001, 41_002],
      inspections: [
        { ownership: 'external', listenerProcessId: 999 },
        { ownership: 'owned', listenerProcessId: 202 }
      ]
    })

    const run = await fixture.launcher.launch({
      ...launchCommand(),
      portIntent: preferredPort()
    })

    expect(run.endpoint.port).toBe(41_002)
    expect(fixture.processes.starts).toHaveLength(2)
    expect(fixture.processes.stops).toEqual([fixture.processes.starts[0]?.scope.sessionId])
    expect(fixture.registry.findActiveByPort(41_001)).toBeNull()
    expect(fixture.registry.findActiveByPort(41_002)?.state).toBe('bound')
  })

  it('fails closed and quarantines when listener ownership cannot be proven', async () => {
    const fixture = createFixture({
      reservations: [41_001],
      inspections: [{ ownership: 'unknown', reason: 'listener-inspection-unavailable' }]
    })

    await expect(
      fixture.launcher.launch({ ...launchCommand(), portIntent: preferredPort() })
    ).rejects.toMatchObject({
      code: 'SERVICE_LISTENER_OWNERSHIP_UNVERIFIED',
      details: {
        port: 41_001,
        attemptedProjectId: 'project-1',
        attemptedWorkspaceName: 'main',
        attemptedBlockId: 'api',
        attemptedSessionId: expect.any(String),
        attemptedRunId: expect.any(String),
        attemptedGeneration: 1
      }
    })
    expect(fixture.registry.findActiveByPort(41_001)?.state).toBe('quarantined')
  })

  it('includes the exact attempted run identity when fixed activation ownership mismatches', async () => {
    const fixture = createFixture({
      reservations: [3_000],
      inspections: [{ ownership: 'external', listenerProcessId: 999 }]
    })

    await expect(
      fixture.launcher.launch({
        ...launchCommand(),
        portIntent: {
          protocol: 'http',
          policy: { type: 'fixed', port: 3_000 },
          binding: { type: 'none' }
        }
      })
    ).rejects.toMatchObject({
      code: 'SERVICE_LISTENER_OWNERSHIP_MISMATCH',
      details: {
        port: 3_000,
        attemptedProjectId: 'project-1',
        attemptedProjectDirectory: '/project',
        attemptedWorkspaceName: 'main',
        attemptedWorkspaceDirectory: '/project',
        attemptedGitBranch: 'main',
        attemptedBlockId: 'api',
        attemptedSessionId: expect.any(String),
        attemptedRunId: expect.any(String),
        attemptedGeneration: 1
      }
    })
  })

  it('releases a bound lease only after process exit and listener closure are both confirmed', async () => {
    const fixture = createFixture({
      reservations: [41_001],
      inspections: [{ ownership: 'owned', listenerProcessId: 201 }]
    })
    const cleanupStates: string[] = []
    const run = await fixture.launcher.launch({
      ...launchCommand(),
      portIntent: preferredPort(),
      onPortStateChanged: (_session, _endpoint, state) => cleanupStates.push(state)
    })

    await fixture.launcher.stop(run.session.id)

    expect(fixture.processes.stops).toEqual([run.session.id])
    expect(fixture.readiness.closedCommands).toEqual([
      expect.objectContaining({ host: '127.0.0.1', port: 41_001 })
    ])
    expect(fixture.registry.findActiveByPort(41_001)).toBeNull()
    expect(cleanupStates).toEqual(['releasing', 'released'])
  })

  it('quarantines the lease when the managed listener does not close after process exit', async () => {
    const fixture = createFixture({
      reservations: [41_001],
      inspections: [{ ownership: 'owned', listenerProcessId: 201 }],
      closeFailure: true
    })
    const cleanupStates: string[] = []
    const run = await fixture.launcher.launch({
      ...launchCommand(),
      portIntent: preferredPort(),
      onPortStateChanged: (_session, _endpoint, state) => cleanupStates.push(state)
    })

    await expect(fixture.launcher.stop(run.session.id)).rejects.toMatchObject({
      code: 'SERVICE_PORT_CLEANUP_FAILED'
    })
    expect(fixture.registry.findActiveByPort(41_001)?.state).toBe('quarantined')
    expect(cleanupStates).toEqual(['releasing', 'quarantined'])
  })

  it('does not let cleanup-state publication failure block listener release', async () => {
    const fixture = createFixture({
      reservations: [41_001],
      inspections: [{ ownership: 'owned', listenerProcessId: 201 }]
    })
    const publicationFailures: unknown[] = []
    const run = await fixture.launcher.launch({
      ...launchCommand(),
      portIntent: preferredPort(),
      onPortStateChanged: () => {
        throw new Error('renderer unavailable')
      },
      onCleanupFailed: (error) => publicationFailures.push(error)
    })

    await fixture.launcher.stop(run.session.id)

    expect(fixture.registry.findActiveByPort(41_001)).toBeNull()
    expect(publicationFailures).toHaveLength(2)
  })

  it('reports a structured cleanup failure after a bound service exits naturally', async () => {
    const fixture = createFixture({
      reservations: [41_001],
      inspections: [{ ownership: 'owned', listenerProcessId: 201 }],
      closeFailure: true
    })
    const cleanupFailures: unknown[] = []
    await fixture.launcher.launch({
      ...launchCommand(),
      portIntent: preferredPort(),
      onCleanupFailed: (error) => cleanupFailures.push(error)
    })

    fixture.processes.exitLatest(1)

    await vi.waitFor(() =>
      expect(cleanupFailures).toEqual([
        expect.objectContaining({ code: 'SERVICE_PORT_CLEANUP_FAILED' })
      ])
    )
    expect(fixture.registry.findActiveByPort(41_001)?.state).toBe('quarantined')
  })

  it('routes generic session termination through managed cleanup', async () => {
    const fixture = createFixture({
      reservations: [41_001],
      inspections: [{ ownership: 'owned', listenerProcessId: 201 }]
    })
    const run = await fixture.launcher.launch({
      ...launchCommand(),
      portIntent: preferredPort()
    })

    await fixture.sessions.terminate(run.session.id)

    expect(fixture.processes.stops).toEqual([run.session.id])
    expect(fixture.readiness.closedCommands).toHaveLength(1)
    expect(fixture.registry.findActiveByPort(41_001)).toBeNull()
  })

  it('waits for both the output marker and TCP reachability before inspecting ownership', async () => {
    const readinessGate = deferred<void>()
    const fixture = createFixture({
      reservations: [41_001],
      inspections: [{ ownership: 'owned', listenerProcessId: 201 }],
      readinessGate
    })
    const launching = fixture.launcher.launch({
      ...launchCommand(),
      readiness: { type: 'output', text: 'ready' },
      portIntent: preferredPort()
    })

    await vi.waitFor(() => expect(fixture.processes.starts).toHaveLength(1))
    fixture.processes.outputLatest('ready')
    await vi.waitFor(() => expect(fixture.readiness.readyCommands).toHaveLength(1))
    expect(fixture.inspector.commands).toEqual([])

    readinessGate.resolve()
    await launching
    expect(fixture.inspector.commands).toHaveLength(1)
  })

  it('uses one cleanup path when the process exits before readiness', async () => {
    const readinessGate = deferred<void>()
    const fixture = createFixture({
      reservations: [41_001],
      inspections: [{ ownership: 'owned', listenerProcessId: 201 }],
      readinessGate
    })
    const launching = fixture.launcher.launch({
      ...launchCommand(),
      portIntent: preferredPort()
    })

    await vi.waitFor(() => expect(fixture.processes.starts).toHaveLength(1))
    fixture.processes.exitLatest(1)

    await expect(launching).rejects.toMatchObject({
      message: 'Managed service exited before becoming ready.'
    })
    expect(fixture.readiness.closedCommands).toHaveLength(1)
    expect(fixture.registry.findActiveByPort(41_001)).toBeNull()
  })

  it('registers the managed resource before the start gate can be hard-disposed', async () => {
    const startGate = deferred<void>()
    const fixture = createFixture({
      reservations: [41_001],
      inspections: [{ ownership: 'owned', listenerProcessId: 201 }],
      startGate
    })
    const launching = fixture.launcher.launch({
      ...launchCommand(),
      portIntent: preferredPort()
    })

    await vi.waitFor(() => expect(fixture.processes.starts).toHaveLength(1))
    const disposing = fixture.lifecycle.hardDisposeWorkspace({
      projectDirectory: '/project',
      workspaceName: 'main'
    })
    startGate.resolve()

    const lease = await disposing
    await Promise.allSettled([launching])
    expect(fixture.launcher.getActive(fixture.processes.starts[0]!.scope.sessionId)).toBeNull()
    expect(fixture.registry.findActiveByPort(41_001)).toBeNull()
    expect(fixture.processes.stops).toEqual([fixture.processes.starts[0]!.scope.sessionId])
    lease.release()
  })
})

function createFixture(input: {
  readonly reservations: Array<number | null>
  readonly inspections: Array<
    | { readonly ownership: 'owned' | 'external'; readonly listenerProcessId: number }
    | { readonly ownership: 'unknown'; readonly reason: string }
  >
  readonly closeFailure?: boolean
  readonly inspectionGate?: Deferred<void>
  readonly readinessGate?: Deferred<void>
  readonly startGate?: Deferred<void>
  readonly reservationReleaseFailure?: boolean
}) {
  const processes = new RecordingProcessPort(input.startGate)
  const lifecycle = new RunLifecycleService()
  const sessions = new TerminalSessionService(processes, undefined, lifecycle)
  const registry = new ServicePortLeaseRegistry()
  const readiness = new RecordingReadiness(input.closeFailure ?? false, input.readinessGate)
  const inspector = new SequencedInspector(input.inspections, input.inspectionGate)
  const allocator = new LocalPortAllocator(
    new SequencedReservations(input.reservations, input.reservationReleaseFailure ?? false),
    registry
  )
  const launcher = new ManagedServiceLauncher(
    sessions,
    allocator,
    readiness,
    inspector,
    lifecycle,
    { maxActivationAttempts: 3 }
  )

  return { allocator, inspector, launcher, lifecycle, processes, readiness, registry, sessions }
}

class RecordingProcessPort implements TerminalProcessPort {
  readonly starts: StartTerminalProcessCommand[] = []
  readonly stops: string[] = []

  constructor(private readonly startGate?: Deferred<void>) {}

  async start(command: StartTerminalProcessCommand): Promise<{ readonly processId: number }> {
    this.starts.push(command)
    await this.startGate?.promise
    return { processId: 200 + this.starts.length }
  }
  write(): void {}
  resize(): void {}
  pauseOutput(): void {}
  resumeOutput(): void {}
  async readWorkingDirectory(): Promise<null> {
    return null
  }
  async stop(sessionId: string): Promise<void> {
    this.stops.push(sessionId)
  }
  async disposeAll(): Promise<void> {}

  outputLatest(data: string): void {
    const command = this.starts.at(-1)
    if (!command) throw new Error('No process has started.')
    command.onOutput({ scope: command.scope, sessionId: command.scope.sessionId, data })
  }

  exitLatest(exitCode: number | null): void {
    const command = this.starts.at(-1)
    if (!command) throw new Error('No process has started.')
    command.onExit({ scope: command.scope, sessionId: command.scope.sessionId, exitCode })
  }
}

class SequencedReservations implements LocalPortReservationPort {
  constructor(
    private readonly ports: Array<number | null>,
    private readonly releaseFailure: boolean
  ) {}

  async tryReserve() {
    const port = this.ports.shift()
    if (port === null || port === undefined) return null
    return {
      host: '127.0.0.1' as const,
      port,
      release: async () => {
        if (this.releaseFailure) throw new Error('reservation close failed')
      }
    }
  }
}

class SequencedInspector implements TcpListenerInspectionPort {
  readonly commands: Parameters<TcpListenerInspectionPort['inspect']>[0][] = []

  constructor(
    private readonly inspections: Awaited<ReturnType<TcpListenerInspectionPort['inspect']>>[],
    private readonly inspectionGate?: Deferred<void>
  ) {}

  async inspect(command: Parameters<TcpListenerInspectionPort['inspect']>[0]) {
    this.commands.push(command)
    await this.inspectionGate?.promise
    return this.inspections.shift() ?? { ownership: 'unknown' as const, reason: 'missing-fixture' }
  }
}

class RecordingReadiness implements TcpReadinessPort {
  readonly readyCommands: Parameters<TcpReadinessPort['waitUntilReady']>[0][] = []
  readonly closedCommands: Parameters<TcpReadinessPort['waitUntilClosed']>[0][] = []

  constructor(
    private readonly closeFailure: boolean,
    private readonly readinessGate?: Deferred<void>
  ) {}

  async waitUntilReady(command: Parameters<TcpReadinessPort['waitUntilReady']>[0]): Promise<void> {
    this.readyCommands.push(command)
    await this.readinessGate?.promise
  }

  async waitUntilClosed(
    command: Parameters<TcpReadinessPort['waitUntilClosed']>[0]
  ): Promise<void> {
    this.closedCommands.push(command)
    if (this.closeFailure) throw new Error('listener still reachable')
  }
}

function launchCommand() {
  return {
    projectId: 'project-1',
    projectDirectory: '/project',
    workspaceName: 'main',
    workspaceDirectory: '/project',
    gitBranch: 'main',
    blockId: 'api',
    workingDirectory: '/project',
    launchCommand: 'pnpm dev',
    readiness: { type: 'tcp' as const },
    readinessTimeoutMs: 30_000,
    signal: new AbortController().signal,
    onOutput: () => undefined,
    onExit: () => undefined,
    onSessionStarted: () => undefined
  }
}

function preferredPort() {
  return {
    protocol: 'http' as const,
    policy: { type: 'preferred' as const, port: 3_000 },
    binding: { type: 'environment' as const, variableName: 'PORT' }
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>
  resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}
