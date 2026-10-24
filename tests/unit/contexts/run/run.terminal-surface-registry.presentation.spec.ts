import type { TerminalViewOutputEvent } from '../../../../src/contexts/run/application/ports/TerminalModelPort'
import type { Mock } from 'vitest'
import {
  TerminalSurfaceRegistry,
  type TerminalSurface
} from '../../../../src/contexts/run/presentation/terminal-surface/terminalSurfaceRegistry'

describe('terminal surface registry disposable views', () => {
  it('claims the incoming workspace before trimming outgoing mounts from the same commit', async () => {
    let id = 0
    const registry = new TerminalSurfaceRegistry(
      () => {
        const surface = createFakeSurface()
        surface.retain = vi.fn(() => true)
        return surface
      },
      () => `view-${++id}`
    )
    const scopes = ['incoming', 'outgoing'].map((workspaceId) =>
      Array.from({ length: 6 }, (_, index) => ({
        ...createIdentity(),
        workspaceId,
        blockId: `block-${index}`
      }))
    )
    const incoming = scopes[0]!.map((identity) => registry.create(identity))
    const outgoing = scopes[1]!.map((identity) => registry.create(identity))
    const detach = vi.fn(async () => undefined)
    for (const lease of incoming) registry.retain(lease.viewId, { detach, onInput: vi.fn() })
    await Promise.resolve()
    for (const lease of outgoing) registry.retain(lease.viewId, { detach, onInput: vi.fn() })
    const resumed = scopes[0]!.map((identity) => registry.create(identity))
    await Promise.resolve()
    expect(resumed.map((lease) => lease.viewId)).toEqual(incoming.map((lease) => lease.viewId))
    expect(resumed.every((lease) => lease.retained)).toBe(true)
    expect(detach).not.toHaveBeenCalled()
    registry.disposeAll()
  })

  it('keeps the live lease and output stream when a mounted terminal is retained', () => {
    const surface = createFakeSurface()
    surface.retain = vi.fn(() => true)
    const detach = vi.fn(async () => undefined)
    let id = 0
    const registry = new TerminalSurfaceRegistry(
      () => surface,
      () => `view-${++id}`
    )
    const identity = createIdentity()
    const first = registry.create(identity)
    expect(registry.retain(first.viewId, { detach, onInput: vi.fn() })).toBe(true)
    registry.write(createOutputEvent(identity, first.viewId, 1, 'hidden output'))
    expect(surface.write).toHaveBeenCalledWith({ sequence: 1, data: 'hidden output' })
    const second = registry.create(identity)
    expect(second).toMatchObject({ viewId: first.viewId, surface, retained: true })
    expect(detach).not.toHaveBeenCalled()
    registry.disposeAll()
  })

  it('hands the response lease back exactly once on bounded eviction, then disposes', async () => {
    let id = 0
    let acknowledge!: () => void
    const detach = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          acknowledge = resolve
        })
    )
    const registry = new TerminalSurfaceRegistry(
      () => {
        const surface = createFakeSurface()
        surface.retain = vi.fn(() => true)
        return surface
      },
      () => `view-${++id}`
    )
    const leases = Array.from({ length: 7 }, (_, index) => {
      const lease = registry.create({ ...createIdentity(), blockId: `block-${index}` })
      registry.retain(lease.viewId, { detach, onInput: vi.fn() })
      return lease
    })
    await Promise.resolve()
    expect(detach).toHaveBeenCalledOnce()
    expect(leases[0]!.surface.dispose).not.toHaveBeenCalled()
    acknowledge()
    await Promise.resolve()
    await Promise.resolve()
    expect(leases[0]!.surface.dispose).toHaveBeenCalledOnce()
    registry.disposeAll()
  })

  it('retires a hidden stream that needs restoration instead of keeping a broken hot entry', async () => {
    const surface = createFakeSurface()
    let requireRestore!: () => void
    surface.retain = vi.fn((handlers) => {
      requireRestore = handlers.onRestoreRequired
      return true
    })
    let id = 0
    const registry = new TerminalSurfaceRegistry(
      () => surface,
      () => `view-${++id}`
    )
    const first = registry.create(createIdentity())
    const detach = vi.fn(async () => undefined)
    registry.retain(first.viewId, { detach, onInput: vi.fn() })
    requireRestore()
    requireRestore()
    await Promise.resolve()
    expect(detach).toHaveBeenCalledOnce()
    expect(registry.create(createIdentity()).viewId).not.toBe(first.viewId)
    registry.disposeAll()
  })

  it.each(['timeout', 'exit', 'replacement', 'shutdown'] as const)(
    'releases mounted retention on %s without reviving the old lease',
    async (reason) => {
      vi.useFakeTimers()
      let id = 0
      const registry = new TerminalSurfaceRegistry(
        () => {
          const surface = createFakeSurface()
          surface.retain = vi.fn(() => true)
          return surface
        },
        () => `view-${++id}`
      )
      try {
        const identity = createIdentity()
        const first = registry.create(identity)
        const detach = vi.fn(async () => undefined)
        registry.retain(first.viewId, { detach, onInput: vi.fn() })
        if (reason === 'timeout') vi.advanceTimersByTime(5 * 60_000)
        if (reason === 'exit') registry.forget(identity)
        if (reason === 'replacement') registry.create({ ...identity, generation: 2 })
        if (reason === 'shutdown') registry.disposeAll()
        await Promise.resolve()
        expect(detach).toHaveBeenCalledOnce()
        expect(first.surface.dispose).toHaveBeenCalledOnce()
        if (reason !== 'shutdown') expect(registry.create(identity).viewId).not.toBe(first.viewId)
      } finally {
        registry.disposeAll()
        vi.useRealTimers()
      }
    }
  )

  it('creates a fresh disposable surface whenever the same run becomes visible again', () => {
    const surfaces: FakeTerminalSurface[] = []
    let nextViewId = 0
    const registry = new TerminalSurfaceRegistry(
      () => {
        const surface = createFakeSurface()
        surfaces.push(surface)
        return surface
      },
      () => `view-${++nextViewId}`
    )
    const identity = createIdentity()
    const first = registry.create(identity)

    registry.release(first.viewId)
    const second = registry.create(identity)

    expect(second.surface).not.toBe(first.surface)
    expect(surfaces).toHaveLength(2)
    expect(first.surface.dispose).toHaveBeenCalledTimes(1)
    expect(registry.getDiagnostics()).toEqual({
      surfaceCount: 1,
      pendingOutputBytes: 0,
      rendererState: 'dom',
      domSurfaceCount: 1,
      focusedSurfaceCount: 0,
      hiddenSurfaceCount: 0,
      visibleSurfaceCount: 0,
      webglSurfaceCount: 0,
      lastDeferReason: null,
      lastDrainDurationMs: 0,
      lastInputToOutputLatencyMs: 0,
      oldestPendingOutputAgeMs: 0,
      pendingOutputTargetCount: 0
    })
  })

  it('reuses an acknowledged detached surface with a new output lease', () => {
    let id = 0
    const registry = new TerminalSurfaceRegistry(createFakeSurface, () => `view-${++id}`)
    const identity = createIdentity()
    const first = registry.create(identity)
    registry.release(first.viewId, { retain: true })
    const second = registry.create(identity)
    expect(second.surface).toBe(first.surface)
    expect(second.viewId).not.toBe(first.viewId)
    registry.write(createOutputEvent(identity, first.viewId, 1, 'late old view'))
    expect(second.surface.write).not.toHaveBeenCalled()
    registry.disposeAll()
  })

  it('bounds retained instances and expires them even without another acquisition', async () => {
    vi.useFakeTimers()
    let id = 0
    const registry = new TerminalSurfaceRegistry(createFakeSurface, () => `view-${++id}`)
    const leases = Array.from({ length: 7 }, (_, index) => {
      const lease = registry.create({ ...createIdentity(), blockId: `block-${index}` })
      registry.release(lease.viewId, { retain: true })
      return lease
    })
    await Promise.resolve()
    expect(leases[0]!.surface.dispose).toHaveBeenCalledOnce()
    expect(leases[6]!.surface.dispose).not.toHaveBeenCalled()
    vi.advanceTimersByTime(5 * 60_000)
    for (const lease of leases) expect(lease.surface.dispose).toHaveBeenCalledOnce()
    registry.disposeAll()
    vi.useRealTimers()
  })

  it('does not retain unfinished output or revive a previous run generation', () => {
    let id = 0
    const registry = new TerminalSurfaceRegistry(createFakeSurface, () => `view-${++id}`)
    const first = registry.create(createIdentity())
    registry.release(first.viewId, { retain: true })
    const next = registry.create({ ...createIdentity(), generation: 2, runId: 'run-2' })
    expect(next.surface).not.toBe(first.surface)
    expect(first.surface.dispose).toHaveBeenCalledOnce()
    vi.mocked(next.surface.isOutputSettled).mockReturnValue(false)
    registry.release(next.viewId, { retain: true })
    expect(next.surface.dispose).toHaveBeenCalledOnce()
    registry.disposeAll()
  })

  it('discards a delayed detach after a newer view has already been retained', () => {
    let id = 0
    const registry = new TerminalSurfaceRegistry(createFakeSurface, () => `view-${++id}`)
    const old = registry.create(createIdentity())
    const current = registry.create(createIdentity())
    registry.release(current.viewId, { retain: true })
    registry.release(old.viewId, { retain: true })
    expect(old.surface.dispose).toHaveBeenCalledOnce()
    expect(registry.create(createIdentity()).surface).toBe(current.surface)
    registry.disposeAll()
  })

  it('invalidates cached and releasing views when their run ends', () => {
    let id = 0
    const registry = new TerminalSurfaceRegistry(createFakeSurface, () => `view-${++id}`)
    const identity = createIdentity()
    const cached = registry.create(identity)
    registry.release(cached.viewId, { retain: true })
    registry.forget(identity)
    expect(cached.surface.dispose).toHaveBeenCalledOnce()
    const pending = registry.create(identity)
    registry.forget(identity)
    registry.release(pending.viewId, { retain: true })
    expect(pending.surface.dispose).toHaveBeenCalledOnce()
    registry.disposeAll()
  })

  it('routes sequenced output only to the exact live view lease', () => {
    const registry = new TerminalSurfaceRegistry(createFakeSurface, () => 'view-current')
    const identity = createIdentity()
    const lease = registry.create(identity)

    registry.write(createOutputEvent(identity, 'view-stale', 1, 'stale'))
    registry.write(createOutputEvent(identity, lease.viewId, 2, 'live'))
    registry.write(
      createOutputEvent(
        { ...identity, generation: identity.generation + 1 },
        lease.viewId,
        3,
        'old'
      )
    )

    expect(lease.surface.write).toHaveBeenCalledTimes(1)
    expect(lease.surface.write).toHaveBeenCalledWith({ sequence: 2, data: 'live' })
  })

  it('disposes every remaining view during renderer shutdown', () => {
    let nextViewId = 0
    const registry = new TerminalSurfaceRegistry(createFakeSurface, () => `view-${++nextViewId}`)
    const first = registry.create(createIdentity())
    const second = registry.create({ ...createIdentity(), sessionId: 'session-2', runId: 'run-2' })

    registry.disposeAll()

    expect(first.surface.dispose).toHaveBeenCalledTimes(1)
    expect(second.surface.dispose).toHaveBeenCalledTimes(1)
  })

  it('applies a changed scrollback budget to every live disposable view', () => {
    let nextViewId = 0
    const registry = new TerminalSurfaceRegistry(createFakeSurface, () => `view-${++nextViewId}`)
    const first = registry.create(createIdentity())
    const second = registry.create({ ...createIdentity(), sessionId: 'session-2', runId: 'run-2' })

    registry.setScrollbackRows(5000)

    expect(first.surface.setScrollbackRows).toHaveBeenCalledWith(5000)
    expect(second.surface.setScrollbackRows).toHaveBeenCalledWith(5000)
  })

  it('registers and releases the optional raster capability with the shared coordinator', () => {
    const unregister = vi.fn()
    const rasterCoordinator = { register: vi.fn(() => unregister) }
    const surface = createFakeSurface()
    const rasterTarget = {
      getRasterCost: vi.fn(() => 96_000),
      getRasterPriority: vi.fn(() => 'visible' as const),
      getRasterScale: vi.fn(() => 1 as const),
      setRasterScale: vi.fn()
    }
    surface.rasterTarget = rasterTarget
    const registry = new TerminalSurfaceRegistry(
      () => surface,
      () => 'view-raster',
      rasterCoordinator
    )

    const lease = registry.create(createIdentity())

    expect(rasterCoordinator.register).toHaveBeenCalledWith({ id: lease.viewId, ...rasterTarget })

    registry.release(lease.viewId)

    expect(unregister).toHaveBeenCalledOnce()
  })

  it('reports focused, visible, and hidden surface counts from the shared raster owner', () => {
    let nextViewId = 0
    let nextSurface = 0
    const priorities = ['focused', 'visible', 'hidden'] as const
    const registry = new TerminalSurfaceRegistry(
      () => {
        const surface = createFakeSurface()
        const priority = priorities[nextSurface++]!
        surface.rasterTarget = {
          getRasterCost: vi.fn(() => 96_000),
          getRasterPriority: vi.fn(() => priority),
          getRasterScale: vi.fn(() => 1 as const),
          setRasterScale: vi.fn()
        }
        return surface
      },
      () => `view-${++nextViewId}`
    )

    priorities.forEach((_priority, index) =>
      registry.create({
        ...createIdentity(),
        generation: index + 1,
        runId: `run-${index + 1}`,
        sessionId: `session-${index + 1}`
      })
    )

    expect(registry.getDiagnostics()).toMatchObject({
      focusedSurfaceCount: 1,
      hiddenSurfaceCount: 1,
      surfaceCount: 3,
      visibleSurfaceCount: 1
    })
  })

  it('registers and releases output plus initialization work with the shared scheduler', () => {
    const unregister = vi.fn()
    const workloadScheduler = {
      getDiagnostics: vi.fn(() => ({
        lastDeferReason: 'interaction' as const,
        lastDrainDurationMs: 2,
        lastInputToOutputLatencyMs: 4,
        oldestPendingOutputAgeMs: 12,
        pendingOutputTargetCount: 1
      })),
      register: vi.fn(() => unregister)
    }
    const surface = createFakeSurface()
    const workloadTarget = {
      drainOutput: vi.fn(async () => null),
      getOutputPriority: vi.fn(() => 'visible' as const),
      hasPendingOutput: vi.fn(() => false),
      onOutputPendingChange: vi.fn(() => () => undefined),
      onOutputPriorityChange: vi.fn(() => () => undefined),
      onTerminalInput: vi.fn(() => () => undefined)
    }
    surface.workloadTarget = workloadTarget
    const registry = new TerminalSurfaceRegistry(
      () => surface,
      () => 'view-workload',
      undefined,
      workloadScheduler
    )

    const lease = registry.create(createIdentity())

    expect(workloadScheduler.register).toHaveBeenCalledWith({
      id: lease.viewId,
      ...workloadTarget
    })
    expect(registry.getDiagnostics()).toMatchObject({
      lastDeferReason: 'interaction',
      lastDrainDurationMs: 2,
      lastInputToOutputLatencyMs: 4,
      oldestPendingOutputAgeMs: 12,
      pendingOutputTargetCount: 1
    })

    registry.release(lease.viewId)

    expect(unregister).toHaveBeenCalledOnce()
  })

  it('waits for a visible matching surface to consume its pending output', async () => {
    const surface = createFakeSurface()
    let isSettled = false
    let settleListener: (() => void) | undefined
    surface.isOutputSettled.mockImplementation(() => isSettled)
    surface.onOutputSettled.mockImplementation((listener) => {
      settleListener = listener
      return () => {
        settleListener = undefined
      }
    })
    surface.rasterTarget = {
      getRasterCost: vi.fn(() => 96_000),
      getRasterPriority: vi.fn(() => 'visible' as const),
      getRasterScale: vi.fn(() => 1 as const),
      setRasterScale: vi.fn()
    }
    const registry = new TerminalSurfaceRegistry(
      () => surface,
      () => 'view-visible'
    )
    const identity = createIdentity()
    registry.create(identity)
    let didSettle = false

    const settled = registry.waitForOutputSettled(identity).then(() => {
      didSettle = true
    })
    await Promise.resolve()
    expect(didSettle).toBe(false)

    isSettled = true
    settleListener?.()
    await settled
    expect(didSettle).toBe(true)
  })

  it('does not block on hidden or absent surfaces and releases an in-flight waiter', async () => {
    const surface = createFakeSurface()
    surface.isOutputSettled.mockReturnValue(false)
    surface.rasterTarget = {
      getRasterCost: vi.fn(() => 96_000),
      getRasterPriority: vi.fn(() => 'hidden' as const),
      getRasterScale: vi.fn(() => 1 as const),
      setRasterScale: vi.fn()
    }
    const registry = new TerminalSurfaceRegistry(
      () => surface,
      () => 'view-hidden'
    )
    const identity = createIdentity()
    const lease = registry.create(identity)

    await expect(registry.waitForOutputSettled(identity)).resolves.toBeUndefined()
    await expect(
      registry.waitForOutputSettled({ ...identity, runId: 'absent-run' })
    ).resolves.toBeUndefined()

    surface.rasterTarget.getRasterPriority = vi.fn(() => 'focused' as const)
    const pending = registry.waitForOutputSettled(identity)
    registry.release(lease.viewId)
    await expect(pending).resolves.toBeUndefined()
  })
})

interface FakeTerminalSurface extends TerminalSurface {
  rasterTarget?: TerminalSurface['rasterTarget']
  workloadTarget?: TerminalSurface['workloadTarget']
  readonly detach: Mock<TerminalSurface['detach']>
  readonly dispose: Mock<TerminalSurface['dispose']>
  readonly isOutputSettled: Mock<TerminalSurface['isOutputSettled']>
  readonly onOutputSettled: Mock<TerminalSurface['onOutputSettled']>
  readonly restore: Mock<TerminalSurface['restore']>
  readonly write: Mock<TerminalSurface['write']>
}

function createFakeSurface(): FakeTerminalSurface {
  return {
    attach: vi.fn<TerminalSurface['attach']>(),
    clearSearch: vi.fn<TerminalSurface['clearSearch']>(),
    detach: vi.fn<TerminalSurface['detach']>(),
    dispose: vi.fn<TerminalSurface['dispose']>(),
    find: vi.fn<TerminalSurface['find']>(),
    focus: vi.fn<TerminalSurface['focus']>(),
    getDiagnostics: vi.fn<TerminalSurface['getDiagnostics']>(() => ({
      pendingOutputBytes: 0,
      rendererState: 'dom'
    })),
    isBracketedPasteMode: vi.fn<TerminalSurface['isBracketedPasteMode']>(() => false),
    isOutputSettled: vi.fn<TerminalSurface['isOutputSettled']>(() => true),
    park: vi.fn(),
    onOutputSettled: vi.fn<TerminalSurface['onOutputSettled']>(() => () => undefined),
    restore: vi.fn<TerminalSurface['restore']>(),
    setScrollbackRows: vi.fn<TerminalSurface['setScrollbackRows']>(),
    setResizeSuspended: vi.fn<TerminalSurface['setResizeSuspended']>(),
    write: vi.fn<TerminalSurface['write']>()
  }
}

function createIdentity() {
  return {
    projectId: 'project-alpha',
    workspaceId: 'feature/sidebar',
    blockId: 'terminal-1',
    sessionId: 'session-1',
    runId: 'run-1',
    generation: 1
  }
}

function createOutputEvent(
  identity: ReturnType<typeof createIdentity>,
  viewId: string,
  sequence: number,
  data: string
): TerminalViewOutputEvent {
  return {
    viewId,
    sessionId: identity.sessionId,
    output: { sequence, data },
    scope: {
      ...identity,
      projectDirectory: '/tmp/project-alpha',
      workspaceDirectory: '/tmp/project-alpha-worktrees/feature-sidebar',
      gitBranch: 'feature/sidebar'
    }
  }
}
