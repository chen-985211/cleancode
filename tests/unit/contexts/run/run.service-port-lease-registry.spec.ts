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
