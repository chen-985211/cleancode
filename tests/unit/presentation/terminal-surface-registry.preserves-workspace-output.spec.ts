import type { TerminalViewOutputEvent } from '../../../src/contexts/run/application/ports/TerminalModelPort'
import type { Mock } from 'vitest'
import {
  TerminalSurfaceRegistry,
  type TerminalSurface
} from '../../../src/presentation/app-shell/terminalSurfaceRegistry'

describe('terminal surface registry disposable views', () => {
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
})

interface FakeTerminalSurface extends TerminalSurface {
  rasterTarget?: TerminalSurface['rasterTarget']
  workloadTarget?: TerminalSurface['workloadTarget']
  readonly detach: Mock<TerminalSurface['detach']>
  readonly dispose: Mock<TerminalSurface['dispose']>
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
