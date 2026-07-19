import type { AgentXtermSurface } from '../../../src/presentation/app-shell/agentTerminalXterm'
import { AgentTerminalSurfaceRegistry } from '../../../src/presentation/app-shell/agentTerminalSurfaceRegistry'

describe('Agent terminal surface registry', () => {
  const owner = { agentId: 'agent-1', projectId: 'project-1', workspaceName: 'main' }

  it('routes complete background PTY output to the preserved session surface', () => {
    const surface = createFakeSurface()
    const registry = new AgentTerminalSurfaceRegistry(() => surface)
    const acquired = registry.acquire(owner)
    registry.bind(owner, 'session-1', acquired)
    const output = 'x'.repeat(8_193) + '\u001b[2;1HREADY'

    registry.write({ agentId: owner.agentId, data: output, sessionId: 'session-1' })

    expect(surface.write).toHaveBeenCalledWith(output)
    expect(registry.acquire(owner)).toBe(surface)
    expect(surface.dispose).not.toHaveBeenCalled()
  })

  it('buffers complete startup chunks until the session surface is bound', () => {
    const surface = createFakeSurface()
    const registry = new AgentTerminalSurfaceRegistry(() => surface)
    const firstChunk = '\u001b[38;2;255;255'
    const secondChunk = ';255mREADY'

    registry.write({ agentId: owner.agentId, data: firstChunk, sessionId: 'session-1' })
    registry.write({ agentId: owner.agentId, data: secondChunk, sessionId: 'session-1' })

    expect(registry.bind(owner, 'session-1', registry.acquire(owner))).toBe(
      firstChunk + secondChunk
    )
  })

  it('disposes retained surfaces when their workspace lifecycle ends', () => {
    const surface = createFakeSurface()
    const registry = new AgentTerminalSurfaceRegistry(() => surface)
    registry.acquire(owner)

    registry.releaseWorkspace(owner.projectId, owner.workspaceName)

    expect(surface.dispose).toHaveBeenCalledTimes(1)
  })
})

function createFakeSurface(): AgentXtermSurface {
  return {
    attach: vi.fn(),
    detach: vi.fn(),
    dispose: vi.fn(),
    invalidateSessionReplacement: vi.fn(),
    replaceSession: vi.fn(async () => undefined),
    write: vi.fn()
  }
}
