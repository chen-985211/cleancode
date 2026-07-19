import type { TerminalOutputEvent } from '../../../src/contexts/run/application/ports/TerminalProcessPort'
import type { Mock } from 'vitest'
import {
  TerminalSurfaceRegistry,
  type TerminalSurface
} from '../../../src/presentation/app-shell/terminalSurfaceRegistry'

describe('terminal surface registry workspace retention', () => {
  it('keeps one surface alive while detached and routes background output by exact run identity', () => {
    const surfaces: FakeTerminalSurface[] = []
    const registry = new TerminalSurfaceRegistry(() => {
      const surface = createFakeSurface()

      surfaces.push(surface)
      return surface
    })
    const identity = createIdentity()
    const firstSurface = registry.acquire(identity)

    firstSurface.detach(document.createElement('div'))
    registry.write(createOutputEvent(identity, 'background output\n'))
    const reattachedSurface = registry.acquire(identity)

    expect(reattachedSurface).toBe(firstSurface)
    expect(surfaces).toHaveLength(1)
    expect(firstSurface.write).toHaveBeenCalledWith('background output\n')
    expect(firstSurface.dispose).not.toHaveBeenCalled()
  })

  it('ignores stale generations and disposes surfaces that no longer have a current session', () => {
    const registry = new TerminalSurfaceRegistry(createFakeSurface)
    const identity = createIdentity()
    const surface = registry.acquire(identity)

    registry.write(
      createOutputEvent({ ...identity, runId: 'stale-run', generation: 0 }, 'stale output\n')
    )
    registry.retain([{ ...identity, runId: 'replacement-run', generation: 2 }])

    expect(surface.write).not.toHaveBeenCalled()
    expect(surface.dispose).toHaveBeenCalledTimes(1)
  })
})

interface FakeTerminalSurface extends TerminalSurface {
  readonly detach: Mock<TerminalSurface['detach']>
  readonly dispose: Mock<TerminalSurface['dispose']>
  readonly write: Mock<TerminalSurface['write']>
}

function createFakeSurface(): FakeTerminalSurface {
  return {
    attach: vi.fn<TerminalSurface['attach']>(),
    detach: vi.fn<TerminalSurface['detach']>(),
    dispose: vi.fn<TerminalSurface['dispose']>(),
    focus: vi.fn<TerminalSurface['focus']>(),
    setResizeSuspended: vi.fn<TerminalSurface['setResizeSuspended']>(),
    write: vi.fn<TerminalSurface['write']>()
  }
}

function createIdentity() {
  return {
    projectId: 'project-alpha',
    workspaceName: 'feature/sidebar',
    blockId: 'terminal-1',
    sessionId: 'session-1',
    runId: 'run-1',
    generation: 1
  }
}

function createOutputEvent(
  identity: ReturnType<typeof createIdentity>,
  data: string
): TerminalOutputEvent {
  return {
    sessionId: identity.sessionId,
    data,
    scope: {
      ...identity,
      projectDirectory: '/tmp/project-alpha',
      workspaceDirectory: '/tmp/project-alpha-worktrees/feature-sidebar',
      gitBranch: 'feature/sidebar'
    }
  }
}
