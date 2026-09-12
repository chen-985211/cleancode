import type {
  AgentActivityIdentity,
  AgentTurnCompletedEvent
} from '../../../../src/contexts/agent/application/dto/AgentActivityProtocol'
import { AgentActivityRegistry } from '../../../../src/contexts/agent/application/services/AgentActivityRegistry'

describe('Agent completion publication deadline', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  describe.each(['reported', 'became_idle'] as const)('%s completion', (reason) => {
    it.each([100, 1_000, 1_499])(
      'publishes once within the deadline despite output every %i ms',
      (outputIntervalMs) => {
        const { registry, identity, completions, complete, outputUntil } = createHarness()
        complete(identity, 1, reason)

        outputUntil(2_999, outputIntervalMs)
        expect(completions).toEqual([])
        vi.advanceTimersByTime(1)
        expect(completions).toEqual([expect.objectContaining({ completedAt: 0, identity, reason })])

        outputUntil(10_000, outputIntervalMs)
        expect(completions).toHaveLength(1)
        expect(vi.getTimerCount()).toBe(0)
        registry.dispose()
      }
    )
  })

  it('publishes earlier when output settles before the deadline', () => {
    const { registry, identity, completions, complete } = createHarness()
    complete(identity)
    vi.advanceTimersByTime(500)
    registry.recordTerminalOutput(identity.terminal, 1)

    vi.advanceTimersByTime(1_499)
    expect(completions).toEqual([])
    vi.advanceTimersByTime(1)
    expect(completions).toHaveLength(1)
    vi.advanceTimersByTime(3_000)
    expect(completions).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['working', 'waiting_input', 'waiting_approval', 'release', 'replace', 'dispose'])(
    'cancels the deadline and timer on %s',
    (action) => {
      const { registry, identity, completions, complete, outputUntil } = createHarness()
      complete(identity)
      outputUntil(2_999)

      if (action === 'release') registry.releaseTerminal(identity.terminal)
      else if (action === 'dispose') registry.dispose()
      else if (action === 'replace') {
        registry.registerTerminal({
          ...identity.terminal,
          generation: 2,
          runId: 'replacement-run',
          sessionId: 'replacement-session'
        })
      } else {
        registry.record({
          identity,
          signal: {
            status: action as 'working' | 'waiting_input' | 'waiting_approval',
            type: 'status_changed'
          },
          sourceRevision: 2
        })
      }

      expect(vi.getTimerCount()).toBe(0)
      vi.advanceTimersByTime(10_000)
      expect(completions).toEqual([])
      registry.dispose()
    }
  )

  it('keeps separate deadlines for invocations and gives the next turn a fresh deadline', () => {
    const { registry, identity, completions, complete, outputUntil } = createHarness()
    const otherIdentity = { ...identity, invocationId: 'other-invocation' }
    complete(identity)
    outputUntil(1_000)
    complete(otherIdentity)
    outputUntil(2_000)
    registry.record({
      identity,
      signal: { status: 'working', type: 'status_changed' },
      sourceRevision: 2
    })
    complete(identity, 3)

    outputUntil(3_999)
    expect(completions).toEqual([])
    vi.advanceTimersByTime(1)
    expect(completions).toEqual([
      expect.objectContaining({ completedAt: 1_000, identity: otherIdentity })
    ])
    outputUntil(4_999)
    expect(completions).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(completions).toHaveLength(2)
    expect(completions[1]).toMatchObject({ completedAt: 2_000, identity })
    expect(completions[0]?.completionId).not.toBe(completions[1]?.completionId)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['unavailable', 'invocation_exited'] as const)(
    'preserves the deadline through passive %s and rejects repeated completion reports',
    (signal) => {
      const { registry, identity, completions, complete, outputUntil } = createHarness()
      complete(identity)
      outputUntil(2_000)
      expect(
        registry.record({
          identity,
          signal: { type: 'turn_completed' },
          sourceRevision: 1
        })
      ).toBe(false)
      registry.record({
        identity,
        signal:
          signal === 'unavailable'
            ? { status: 'unavailable', type: 'status_changed' }
            : { type: 'invocation_exited' },
        sourceRevision: 2
      })

      outputUntil(2_999)
      vi.advanceTimersByTime(1)
      expect(completions).toEqual([expect.objectContaining({ completedAt: 0, identity })])
      expect(vi.getTimerCount()).toBe(0)
    }
  )
})

function createHarness() {
  const registry = new AgentActivityRegistry()
  const identity: AgentActivityIdentity = {
    invocationId: 'invocation-1',
    providerId: 'fixture-provider',
    terminal: {
      blockId: 'terminal-1',
      generation: 1,
      gitBranch: 'main',
      projectDirectory: '/project',
      projectId: 'project-1',
      runId: 'run-1',
      sessionId: 'session-1',
      workspaceDirectory: '/workspace',
      workspaceId: 'workspace-1'
    }
  }
  const completions: AgentTurnCompletedEvent[] = []
  registry.subscribe((event) => {
    if (event.type === 'turn_completed') completions.push(event.completion)
  })
  registry.registerTerminal(identity.terminal)
  let sequence = 0

  return {
    complete(target: AgentActivityIdentity, revision = 1, reason = 'reported'): void {
      if (reason === 'became_idle') {
        registry.record({
          identity: target,
          signal: { status: 'working', type: 'status_changed' },
          sourceRevision: revision
        })
      }
      registry.record({
        identity: target,
        signal:
          reason === 'reported'
            ? { type: 'turn_completed' }
            : { status: 'idle', type: 'status_changed' },
        sourceRevision: reason === 'reported' ? revision : revision + 1
      })
    },
    completions,
    identity,
    outputUntil(targetTime: number, intervalMs = 1_000): void {
      while (Date.now() < targetTime) {
        vi.advanceTimersByTime(Math.min(intervalMs, targetTime - Date.now()))
        registry.recordTerminalOutput(identity.terminal, ++sequence)
      }
    },
    registry
  }
}
