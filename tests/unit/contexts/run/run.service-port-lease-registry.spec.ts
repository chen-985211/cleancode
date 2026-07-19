import { ServicePortLeaseRegistry } from '../../../../src/contexts/run/domain/services/ServicePortLeaseRegistry'

describe('service port lease registry', () => {
  it('allows only one active lease for a loopback port and preserves precise ownership', () => {
    const registry = new ServicePortLeaseRegistry()
    const first = registry.reserve(runScope('run-1'), endpoint(41_000))

    expect(first.toSnapshot()).toMatchObject({
      state: 'reserved',
      endpoint: { port: 41_000 },
      owner: { projectId: 'project-1', runId: 'run-1' }
    })
    expect(() => registry.reserve(runScope('run-2'), endpoint(41_000))).toThrow(
      'Service port already has an active lease.'
    )
    expect(registry.findActiveByPort(41_000)?.owner.runId).toBe('run-1')
  })

  it('releases a lease only after the run enters releasing and keeps quarantine unavailable', () => {
    const registry = new ServicePortLeaseRegistry()
    const releasable = registry.reserve(runScope('run-1'), endpoint(41_000))
    releasable.markActivating()
    releasable.markBound()
    releasable.markReleasing()
    releasable.release()

    expect(registry.findActiveByPort(41_000)).toBeNull()
    expect(releasable.toSnapshot().state).toBe('released')

    const quarantined = registry.reserve(runScope('run-2'), endpoint(41_000))
    quarantined.markActivating()
    quarantined.markReleasing()
    quarantined.quarantine('Listener remained reachable after process exit.')

    expect(registry.findActiveByPort(41_000)?.state).toBe('quarantined')
    expect(() => registry.reserve(runScope('run-3'), endpoint(41_000))).toThrow(
      'Service port already has an active lease.'
    )
  })

  it('lets a contender await the exact releasing lease settlement', async () => {
    const registry = new ServicePortLeaseRegistry()
    const lease = registry.reserve(runScope('run-1'), endpoint(41_000))
    lease.markActivating()
    lease.markBound()
    lease.markReleasing()

    const settled = registry.waitForSettlement({ port: 41_000, leaseId: lease.id })
    lease.release()

    await expect(settled).resolves.toMatchObject({
      id: lease.id,
      state: 'released',
      endpoint: { port: 41_000 }
    })
  })

  it('recovers only the exact quarantined lease selected by the caller', () => {
    const registry = new ServicePortLeaseRegistry()
    const lease = registry.reserve(runScope('run-1'), endpoint(41_000))
    lease.markReleasing()
    lease.quarantine('Listener closure was not confirmed.')

    expect(registry.recoverQuarantined({ port: 41_000, leaseId: 'stale-lease' })).toBe(false)
    expect(registry.findActiveByPort(41_000)?.state).toBe('quarantined')
    expect(registry.recoverQuarantined({ port: 41_000, leaseId: lease.id })).toBe(true)
    expect(registry.findActiveByPort(41_000)).toBeNull()
    expect(lease.toSnapshot().state).toBe('released')
  })
})

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

function endpoint(port: number) {
  return {
    protocol: 'http' as const,
    host: '127.0.0.1' as const,
    port,
    requestedPort: 41_000,
    fallback: port !== 41_000,
    displayAddress: `http://127.0.0.1:${port}`,
    openable: true
  }
}
