import { LocalPortAllocator } from '../../../../src/contexts/run/application/services/LocalPortAllocator'
import type {
  LocalPortReservation,
  LocalPortReservationPort
} from '../../../../src/contexts/run/application/ports/LocalPortReservationPort'
import { ServicePortLeaseRegistry } from '../../../../src/contexts/run/domain/services/ServicePortLeaseRegistry'

describe('local port allocator', () => {
  it('never falls back when a fixed port is occupied', async () => {
    const reservations = new FakeReservationPort([null])
    const allocator = new LocalPortAllocator(reservations, new ServicePortLeaseRegistry())

    await expect(
      allocator.allocate({
        scope: runScope('fixed'),
        intent: intent({ type: 'fixed', port: 3_000 })
      })
    ).rejects.toMatchObject({ code: 'SERVICE_PORT_FIXED_CONFLICT' })
    expect(reservations.requestedPorts).toEqual([3_000])
  })

  it('exposes the managed owner identity for a fixed in-process conflict', async () => {
    const registry = new ServicePortLeaseRegistry()
    const existingScope = runScope('existing')
    const attemptedScope = runScope('new-run')
    registry.reserve(existingScope, createEndpoint(3_000))
    const reservations = new FakeReservationPort([])
    const allocator = new LocalPortAllocator(reservations, registry)

    await expect(
      allocator.allocate({
        scope: attemptedScope,
        intent: intent({ type: 'fixed', port: 3_000 })
      })
    ).rejects.toMatchObject({
      code: 'SERVICE_PORT_FIXED_CONFLICT',
      details: {
        port: 3_000,
        attemptedProjectId: attemptedScope.projectId,
        attemptedProjectDirectory: attemptedScope.projectDirectory,
        attemptedWorkspaceName: attemptedScope.workspaceName,
        attemptedWorkspaceDirectory: attemptedScope.workspaceDirectory,
        attemptedGitBranch: attemptedScope.gitBranch,
        attemptedBlockId: attemptedScope.blockId,
        attemptedSessionId: attemptedScope.sessionId,
        attemptedRunId: attemptedScope.runId,
        attemptedGeneration: attemptedScope.generation,
        managedProjectId: 'project-1',
        managedProjectDirectory: '/project',
        managedWorkspaceName: 'main',
        managedWorkspaceDirectory: '/project',
        managedGitBranch: 'main',
        managedBlockId: 'api',
        managedSessionId: 'session-existing',
        managedRunId: 'existing',
        managedGeneration: 1
      }
    })
    expect(reservations.requestedPorts).toEqual([])
  })

  it('reports an immediate fixed conflict when the registry wins after OS reservation', async () => {
    const registry = new ServicePortLeaseRegistry()
    const existingScope = runScope('existing-race-winner')
    const attemptedScope = runScope('fixed-race-loser')
    const reservations = new FakeReservationPort([reservation(3_000)], () => {
      registry.reserve(existingScope, createEndpoint(3_000))
    })
    const allocator = new LocalPortAllocator(reservations, registry, { maxAttempts: 1 })

    await expect(
      allocator.allocate({
        scope: attemptedScope,
        intent: intent({ type: 'fixed', port: 3_000 })
      })
    ).rejects.toMatchObject({
      code: 'SERVICE_PORT_FIXED_CONFLICT',
      details: {
        port: 3_000,
        attemptedProjectId: 'project-1',
        attemptedProjectDirectory: '/project',
        attemptedWorkspaceName: 'main',
        attemptedWorkspaceDirectory: '/project',
        attemptedGitBranch: 'main',
        attemptedBlockId: 'api',
        attemptedSessionId: 'session-fixed-race-loser',
        attemptedRunId: 'fixed-race-loser',
        attemptedGeneration: 1,
        managedProjectId: 'project-1',
        managedProjectDirectory: '/project',
        managedWorkspaceName: 'main',
        managedWorkspaceDirectory: '/project',
        managedGitBranch: 'main',
        managedBlockId: 'api',
        managedSessionId: 'session-existing-race-winner',
        managedRunId: 'existing-race-winner',
        managedGeneration: 1
      }
    })
    expect(reservations.requestedPorts).toEqual([3_000])
    expect(reservations.releasedPorts).toEqual([3_000])
  })

  it('falls back once from a preferred port and reports the actual endpoint', async () => {
    const reservations = new FakeReservationPort([null, reservation(41_001)])
    const allocator = new LocalPortAllocator(reservations, new ServicePortLeaseRegistry())

    const allocation = await allocator.allocate({
      scope: runScope('preferred'),
      intent: intent({ type: 'preferred', port: 3_000 })
    })

    expect(reservations.requestedPorts).toEqual([3_000, undefined])
    expect(allocation.endpoint).toMatchObject({
      port: 41_001,
      requestedPort: 3_000,
      fallback: true
    })
    expect(allocation.lease.toSnapshot().state).toBe('reserved')
  })

  it('uses bounded attempts when auto reservations collide with active in-process leases', async () => {
    const registry = new ServicePortLeaseRegistry()
    registry.reserve(runScope('existing'), createEndpoint(41_001))
    const reservations = new FakeReservationPort([
      reservation(41_001),
      reservation(41_002),
      reservation(41_003)
    ])
    const allocator = new LocalPortAllocator(reservations, registry, { maxAttempts: 2 })

    const allocation = await allocator.allocate({
      scope: runScope('auto'),
      intent: intent({ type: 'auto' })
    })

    expect(allocation.endpoint.port).toBe(41_002)
    expect(reservations.releasedPorts).toEqual([41_001])
    expect(reservations.requestedPorts).toEqual([undefined, undefined])
  })

  it('includes the exact attempted run identity when bounded allocation is exhausted', async () => {
    const attemptedScope = runScope('exhausted')
    const allocator = new LocalPortAllocator(
      new FakeReservationPort([null, null]),
      new ServicePortLeaseRegistry(),
      { maxAttempts: 2 }
    )

    await expect(
      allocator.allocate({ scope: attemptedScope, intent: intent({ type: 'auto' }) })
    ).rejects.toMatchObject({
      code: 'SERVICE_PORT_ALLOCATION_EXHAUSTED',
      details: {
        attempts: 2,
        port: 0,
        attemptedProjectId: attemptedScope.projectId,
        attemptedWorkspaceName: attemptedScope.workspaceName,
        attemptedBlockId: attemptedScope.blockId,
        attemptedSessionId: attemptedScope.sessionId,
        attemptedRunId: attemptedScope.runId,
        attemptedGeneration: attemptedScope.generation
      }
    })
  })

  it('waits for an exact releasing lease before reusing a fixed port', async () => {
    const registry = new ServicePortLeaseRegistry()
    const previous = registry.reserve(runScope('previous'), createEndpoint(3_000))
    previous.markActivating()
    previous.markBound()
    previous.markReleasing()
    const reservations = new FakeReservationPort([reservation(3_000)])
    const allocator = new LocalPortAllocator(reservations, registry)

    const allocating = allocator.allocate({
      scope: runScope('replacement'),
      intent: intent({ type: 'fixed', port: 3_000 })
    })
    await Promise.resolve()
    expect(reservations.requestedPorts).toEqual([])

    previous.release()
    await expect(allocating).resolves.toMatchObject({ endpoint: { port: 3_000 } })
    expect(reservations.requestedPorts).toEqual([3_000])
  })

  it('recovers a quarantined fixed lease only after the exact old run is inactive and OS reservation succeeds', async () => {
    const registry = new ServicePortLeaseRegistry()
    const previous = registry.reserve(runScope('previous'), createEndpoint(3_000))
    previous.markReleasing()
    previous.quarantine('Listener closure was not confirmed.')
    const reservations = new FakeReservationPort([reservation(3_000)])
    const allocator = new LocalPortAllocator(reservations, registry, {
      isRunInactive: (scope) => scope.runId === 'previous'
    })

    const allocation = await allocator.allocate({
      scope: runScope('replacement'),
      intent: intent({ type: 'fixed', port: 3_000 })
    })

    expect(allocation.endpoint.port).toBe(3_000)
    expect(allocation.lease.owner.runId).toBe('replacement')
    expect(previous.toSnapshot().state).toBe('released')
    expect(reservations.requestedPorts).toEqual([3_000])
  })

  it('keeps a quarantined lease unavailable when the old run is not authoritatively inactive', async () => {
    const registry = new ServicePortLeaseRegistry()
    const previous = registry.reserve(runScope('previous'), createEndpoint(3_000))
    previous.markReleasing()
    previous.quarantine('Listener closure was not confirmed.')
    const reservations = new FakeReservationPort([reservation(3_000)])
    const allocator = new LocalPortAllocator(reservations, registry, {
      isRunInactive: () => false
    })

    await expect(
      allocator.allocate({
        scope: runScope('replacement'),
        intent: intent({ type: 'fixed', port: 3_000 })
      })
    ).rejects.toMatchObject({
      code: 'SERVICE_PORT_FIXED_CONFLICT',
      details: { managedLeaseState: 'quarantined', managedRunId: 'previous' }
    })
    expect(reservations.requestedPorts).toEqual([])
  })
})

class FakeReservationPort implements LocalPortReservationPort {
  readonly requestedPorts: Array<number | undefined> = []
  readonly releasedPorts: number[] = []

  constructor(
    private readonly results: Array<LocalPortReservation | null>,
    private readonly beforeReturn?: () => void
  ) {}

  async tryReserve(command: { readonly port?: number }): Promise<LocalPortReservation | null> {
    this.requestedPorts.push(command.port)
    const result = this.results.shift() ?? null
    if (!result) return null
    this.beforeReturn?.()
    return {
      ...result,
      release: async () => {
        this.releasedPorts.push(result.port)
        await result.release()
      }
    }
  }
}

function reservation(port: number): LocalPortReservation {
  return { host: '127.0.0.1', port, release: async () => undefined }
}

function runScope(runId: string) {
  return {
    projectId: 'project-1',
    projectDirectory: '/project',
    workspaceName: 'main',
    workspaceDirectory: '/project',
    gitBranch: 'main',
    blockId: 'api',
    sessionId: `session-${runId}`,
    runId,
    generation: 1
  }
}

function intent(
  policy:
    { readonly type: 'auto' } | { readonly type: 'fixed' | 'preferred'; readonly port: number }
) {
  return {
    protocol: 'http' as const,
    policy,
    binding:
      policy.type === 'fixed'
        ? ({ type: 'none' } as const)
        : ({ type: 'environment', variableName: 'PORT' } as const)
  }
}

function createEndpoint(port: number) {
  return {
    protocol: 'http' as const,
    host: '127.0.0.1' as const,
    port,
    requestedPort: null,
    fallback: false,
    displayAddress: `http://127.0.0.1:${port}`,
    openable: true
  }
}
