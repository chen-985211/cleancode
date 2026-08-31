import type {
  AgentActivityIdentity,
  AgentActivityRegistryEvent,
  AgentActivityTerminalScope
} from '../../../../src/contexts/agent/application/dto/AgentActivityProtocol'
import {
  AgentActivityRegistry,
  type AgentActivityRegistryClock,
  type AgentActivityScheduledTask
} from '../../../../src/contexts/agent/application/services/AgentActivityRegistry'

describe('Agent activity registry', () => {
  it('starts unavailable and fences stale terminal generations and source revisions', () => {
    const registry = new AgentActivityRegistry({ clock: new FakeAgentActivityClock() })
    const firstTerminal = createTerminalScope({ generation: 1 })
    const firstActivity = createActivityIdentity(firstTerminal)
    const events: AgentActivityRegistryEvent[] = []
    registry.subscribe((event) => events.push(event))

    expect(registry.registerTerminal(firstTerminal)).toMatchObject({
      invocations: [],
      revision: 0,
      status: 'unavailable',
      terminal: firstTerminal
    })
    expect(registry.query(firstTerminal)).toMatchObject({
      revision: 0,
      status: 'unavailable'
    })

    expect(
      registry.record({
        identity: firstActivity,
        signal: { status: 'working', type: 'status_changed' },
        sourceRevision: 1
      })
    ).toBe(true)
    expect(registry.query(firstTerminal)).toMatchObject({ revision: 1, status: 'working' })

    expect(
      registry.record({
        identity: firstActivity,
        signal: { status: 'idle', type: 'status_changed' },
        sourceRevision: 1
      })
    ).toBe(false)
    expect(
      registry.record({
        identity: firstActivity,
        signal: { status: 'working', type: 'status_changed' },
        sourceRevision: 2
      })
    ).toBe(true)
    expect(registry.query(firstTerminal)).toMatchObject({ revision: 1, status: 'working' })
    expect(events.filter(({ type }) => type === 'activity_changed')).toHaveLength(2)

    const nextTerminal = createTerminalScope({
      generation: 2,
      runId: 'terminal-run-2',
      sessionId: 'terminal-session-2'
    })
    expect(registry.registerTerminal(nextTerminal)).toMatchObject({
      revision: 0,
      status: 'unavailable'
    })
    expect(registry.query(firstTerminal)).toBeNull()
    expect(registry.registerTerminal(firstTerminal)).toBeNull()
    expect(
      registry.record({
        identity: firstActivity,
        signal: { status: 'idle', type: 'status_changed' },
        sourceRevision: 3
      })
    ).toBe(false)
    expect(
      registry.record({
        identity: createActivityIdentity({
          ...nextTerminal,
          workspaceDirectory: '/workspace/other'
        }),
        signal: { status: 'working', type: 'status_changed' },
        sourceRevision: 1
      })
    ).toBe(false)
    expect(registry.query(nextTerminal)).toMatchObject({ revision: 0, status: 'unavailable' })
  })

  it('publishes dynamic terminal registration and generation replacement without duplicating idempotent registration', () => {
    const registry = new AgentActivityRegistry({ clock: new FakeAgentActivityClock() })
    const firstTerminal = createTerminalScope({ generation: 1 })
    const events: AgentActivityRegistryEvent[] = []
    registry.subscribe((event) => events.push(event))

    expect(registry.registerTerminal(firstTerminal)).toMatchObject({
      revision: 0,
      status: 'unavailable',
      terminal: firstTerminal
    })
    expect(events).toEqual([
      expect.objectContaining({
        snapshot: expect.objectContaining({
          revision: 0,
          status: 'unavailable',
          terminal: firstTerminal
        }),
        type: 'activity_changed'
      })
    ])

    expect(registry.registerTerminal(firstTerminal)).toMatchObject({ revision: 0 })
    expect(events).toHaveLength(1)

    const replacementTerminal = createTerminalScope({
      generation: 2,
      runId: 'terminal-run-2',
      sessionId: 'terminal-session-2'
    })
    expect(registry.registerTerminal(replacementTerminal)).toMatchObject({
      revision: 0,
      status: 'unavailable',
      terminal: replacementTerminal
    })
    expect(events.slice(1)).toEqual([
      expect.objectContaining({
        snapshot: expect.objectContaining({
          revision: 1,
          status: 'unavailable',
          terminal: firstTerminal
        }),
        type: 'activity_changed'
      }),
      expect.objectContaining({
        snapshot: expect.objectContaining({
          revision: 0,
          status: 'unavailable',
          terminal: replacementTerminal
        }),
        type: 'activity_changed'
      })
    ])
  })

  it('keys invocations by Provider, invocation, and optional managed identity and aggregates priority', () => {
    const clock = new FakeAgentActivityClock()
    const registry = new AgentActivityRegistry({ clock })
    const terminal = createTerminalScope()
    registry.registerTerminal(terminal)
    const unmanaged = createActivityIdentity(terminal, {
      invocationId: 'shared-invocation',
      providerId: 'opencode'
    })
    const firstManaged = createActivityIdentity(terminal, {
      invocationId: 'shared-invocation',
      managed: {
        agentId: 'agent-1',
        agentSessionId: 'agent-session-1',
        providerLaunchGeneration: 1
      },
      providerId: 'opencode'
    })
    const secondManaged = createActivityIdentity(terminal, {
      invocationId: 'shared-invocation',
      managed: {
        agentId: 'agent-2',
        agentSessionId: 'agent-session-2',
        providerLaunchGeneration: 1
      },
      providerId: 'opencode'
    })

    recordStatus(registry, unmanaged, 1, 'working')
    recordStatus(registry, firstManaged, 1, 'waiting_input')
    recordStatus(registry, secondManaged, 1, 'waiting_approval')

    expect(registry.query(terminal)).toMatchObject({
      invocations: [
        expect.objectContaining({ managed: undefined, status: 'working' }),
        expect.objectContaining({ managed: firstManaged.managed, status: 'waiting_input' }),
        expect.objectContaining({ managed: secondManaged.managed, status: 'waiting_approval' })
      ],
      revision: 3,
      status: 'waiting_approval'
    })

    recordStatus(registry, secondManaged, 2, 'idle')
    expect(registry.query(terminal)?.status).toBe('waiting_input')
    recordStatus(registry, firstManaged, 2, 'idle')
    expect(registry.query(terminal)?.status).toBe('working')
    recordStatus(registry, unmanaged, 2, 'idle')
    expect(registry.query(terminal)?.status).toBe('idle')
  })

  it('emits each completed turn once after the quiet window and cancels it on new activity', () => {
    const clock = new FakeAgentActivityClock()
    const registry = new AgentActivityRegistry({ clock, quietWindowMs: 1_500 })
    const terminal = createTerminalScope()
    const identity = createActivityIdentity(terminal)
    const completions: AgentActivityRegistryEvent[] = []
    registry.subscribe((event) => {
      if (event.type === 'turn_completed') completions.push(event)
    })
    registry.registerTerminal(terminal)

    recordStatus(registry, identity, 1, 'working')
    recordStatus(registry, identity, 2, 'idle')
    clock.advance(1_499)
    expect(completions).toHaveLength(0)
    clock.advance(1)
    expect(completions).toHaveLength(1)
    expect(completions[0]).toMatchObject({
      completion: {
        identity,
        reason: 'became_idle',
        terminalRevision: 2
      },
      type: 'turn_completed'
    })

    expect(
      registry.record({
        identity,
        signal: { type: 'turn_completed' },
        sourceRevision: 3
      })
    ).toBe(true)
    expect(
      registry.record({
        identity,
        signal: { type: 'turn_completed' },
        sourceRevision: 3
      })
    ).toBe(false)
    recordStatus(registry, identity, 4, 'working')
    clock.advance(1_500)
    expect(completions).toHaveLength(1)

    expect(
      registry.record({
        identity,
        signal: { type: 'turn_completed' },
        sourceRevision: 5
      })
    ).toBe(true)
    clock.advance(1_500)
    expect(completions).toHaveLength(2)
    expect(completions[1]).toMatchObject({
      completion: {
        identity,
        reason: 'reported',
        terminalRevision: 4
      },
      type: 'turn_completed'
    })
    expect(
      (completions[0] as Extract<AgentActivityRegistryEvent, { type: 'turn_completed' }>).completion
        .completionId
    ).not.toBe(
      (completions[1] as Extract<AgentActivityRegistryEvent, { type: 'turn_completed' }>).completion
        .completionId
    )
  })

  it('restarts a pending completion quiet window when newer output reaches the same terminal', () => {
    const clock = new FakeAgentActivityClock()
    const registry = new AgentActivityRegistry({ clock, quietWindowMs: 1_500 })
    const terminal = createTerminalScope()
    const identity = createActivityIdentity(terminal)
    const completions = vi.fn()
    registry.subscribe((event) => {
      if (event.type === 'turn_completed') completions(event)
    })
    registry.registerTerminal(terminal)

    expect(
      registry.record({ identity, signal: { type: 'turn_completed' }, sourceRevision: 1 })
    ).toBe(true)
    clock.advance(1_499)

    expect(registry.recordTerminalOutput(terminal, 1)).toBe(true)
    expect(registry.recordTerminalOutput(terminal, 1)).toBe(false)
    expect(
      registry.recordTerminalOutput(
        {
          ...terminal,
          generation: terminal.generation + 1,
          runId: 'terminal-run-2',
          sessionId: 'terminal-session-2'
        },
        2
      )
    ).toBe(false)

    clock.advance(1_499)
    expect(completions).not.toHaveBeenCalled()
    clock.advance(1)
    expect(completions).toHaveBeenCalledOnce()
  })

  it('keeps inferred completion pending when a different invocation becomes active', () => {
    const clock = new FakeAgentActivityClock()
    const registry = new AgentActivityRegistry({ clock, quietWindowMs: 1_500 })
    const terminal = createTerminalScope()
    const firstIdentity = createActivityIdentity(terminal, { invocationId: 'invocation-1' })
    const secondIdentity = createActivityIdentity(terminal, { invocationId: 'invocation-2' })
    const completions: AgentActivityRegistryEvent[] = []
    registry.subscribe((event) => {
      if (event.type === 'turn_completed') completions.push(event)
    })
    registry.registerTerminal(terminal)

    recordStatus(registry, firstIdentity, 1, 'working')
    recordStatus(registry, firstIdentity, 2, 'idle')
    recordStatus(registry, secondIdentity, 1, 'working')
    clock.advance(1_500)

    expect(completions).toEqual([
      {
        completion: expect.objectContaining({
          identity: firstIdentity,
          reason: 'became_idle',
          terminalRevision: 3
        }),
        type: 'turn_completed'
      }
    ])
    expect(registry.query(terminal)?.status).toBe('working')
  })

  it('publishes explicit completion from unavailable without changing its persistent status', () => {
    const clock = new FakeAgentActivityClock()
    const registry = new AgentActivityRegistry({ clock, quietWindowMs: 1_500 })
    const terminal = createTerminalScope()
    const workingIdentity = createActivityIdentity(terminal, { invocationId: 'working' })
    const unavailableIdentity = createActivityIdentity(terminal, {
      invocationId: 'completion-only'
    })
    const events: AgentActivityRegistryEvent[] = []
    registry.subscribe((event) => events.push(event))
    registry.registerTerminal(terminal)
    recordStatus(registry, workingIdentity, 1, 'working')

    expect(
      registry.record({
        identity: unavailableIdentity,
        signal: { type: 'turn_completed' },
        sourceRevision: 1
      })
    ).toBe(true)
    expect(registry.query(terminal)).toMatchObject({
      invocations: [
        expect.objectContaining({ invocationId: 'working', status: 'working' }),
        expect.objectContaining({ invocationId: 'completion-only', status: 'unavailable' })
      ],
      revision: 2,
      status: 'working'
    })

    recordStatus(registry, workingIdentity, 2, 'working')
    clock.advance(1_500)
    expect(events.filter(({ type }) => type === 'turn_completed')).toEqual([
      {
        completion: expect.objectContaining({
          identity: unavailableIdentity,
          reason: 'reported',
          terminalRevision: 2
        }),
        type: 'turn_completed'
      }
    ])
    expect(
      registry
        .query(terminal)
        ?.invocations.find(({ invocationId }) => invocationId === unavailableIdentity.invocationId)
        ?.status
    ).toBe('unavailable')
  })

  it('cancels only the pending completion owned by the invocation that resumes activity', () => {
    const clock = new FakeAgentActivityClock()
    const registry = new AgentActivityRegistry({ clock, quietWindowMs: 1_500 })
    const terminal = createTerminalScope()
    const firstIdentity = createActivityIdentity(terminal, { invocationId: 'invocation-1' })
    const secondIdentity = createActivityIdentity(terminal, { invocationId: 'invocation-2' })
    const completions: AgentActivityRegistryEvent[] = []
    registry.subscribe((event) => {
      if (event.type === 'turn_completed') completions.push(event)
    })
    registry.registerTerminal(terminal)

    recordStatus(registry, firstIdentity, 1, 'working')
    recordStatus(registry, secondIdentity, 1, 'working')
    recordStatus(registry, firstIdentity, 2, 'idle')
    recordStatus(registry, secondIdentity, 2, 'idle')
    recordStatus(registry, firstIdentity, 3, 'working')
    clock.advance(1_500)

    expect(completions).toEqual([
      {
        completion: expect.objectContaining({
          identity: secondIdentity,
          reason: 'became_idle',
          terminalRevision: 5
        }),
        type: 'turn_completed'
      }
    ])
  })

  it('preserves a confirmed completion while the Provider invocation exits', () => {
    const clock = new FakeAgentActivityClock()
    const registry = new AgentActivityRegistry({ clock, quietWindowMs: 1_500 })
    const terminal = createTerminalScope()
    const identity = createActivityIdentity(terminal)
    const completions: AgentActivityRegistryEvent[] = []
    registry.subscribe((event) => {
      if (event.type === 'turn_completed') completions.push(event)
    })
    registry.registerTerminal(terminal)

    recordStatus(registry, identity, 1, 'working')
    expect(
      registry.record({
        identity,
        signal: { type: 'turn_completed' },
        sourceRevision: 2
      })
    ).toBe(true)
    expect(
      registry.record({
        identity,
        signal: { type: 'invocation_exited' },
        sourceRevision: 3
      })
    ).toBe(true)

    expect(registry.query(terminal)).toMatchObject({ revision: 3, status: 'unavailable' })
    clock.advance(1_500)
    expect(completions).toHaveLength(1)
    expect(completions[0]).toMatchObject({
      completion: {
        identity,
        reason: 'reported',
        terminalRevision: 3
      },
      type: 'turn_completed'
    })
  })

  it('refreshes a managed Agent name in the current snapshot and queued completion', () => {
    const clock = new FakeAgentActivityClock()
    const registry = new AgentActivityRegistry({ clock, quietWindowMs: 1_500 })
    const terminal = createTerminalScope({ owner: { id: 'agent-1', kind: 'agent' } })
    const identity = createActivityIdentity(terminal, {
      managed: {
        agentId: 'agent-1',
        agentName: 'Agent 1',
        agentSessionId: 'agent-session-1',
        providerLaunchGeneration: 3
      }
    })
    const events: AgentActivityRegistryEvent[] = []
    registry.subscribe((event) => events.push(event))
    registry.registerTerminal(terminal)
    recordStatus(registry, identity, 1, 'working')
    expect(
      registry.record({ identity, signal: { type: 'turn_completed' }, sourceRevision: 2 })
    ).toBe(true)

    expect(
      registry.updateManagedAgentName({
        agentName: 'Renamed Agent',
        agentSessionId: 'agent-session-1',
        terminal
      })
    ).toBe(true)
    expect(registry.query(terminal)).toMatchObject({
      invocations: [
        {
          managed: expect.objectContaining({ agentName: 'Renamed Agent' }),
          status: 'idle'
        }
      ],
      revision: 3,
      status: 'idle'
    })
    expect(
      registry.updateManagedAgentName({
        agentName: 'Renamed Agent',
        agentSessionId: 'agent-session-1',
        terminal
      })
    ).toBe(false)

    clock.advance(1_500)
    expect(events.filter(({ type }) => type === 'turn_completed')).toEqual([
      {
        completion: expect.objectContaining({
          identity: expect.objectContaining({
            managed: expect.objectContaining({ agentName: 'Renamed Agent' })
          }),
          terminalRevision: 3
        }),
        type: 'turn_completed'
      }
    ])
    expect(
      registry.record({
        identity,
        signal: { status: 'working', type: 'status_changed' },
        sourceRevision: 2
      })
    ).toBe(false)
  })

  it('publishes invocation membership changes even while terminal status stays unavailable', () => {
    const clock = new FakeAgentActivityClock()
    const registry = new AgentActivityRegistry({ clock })
    const terminal = createTerminalScope()
    const identity = createActivityIdentity(terminal)
    const events: AgentActivityRegistryEvent[] = []
    registry.subscribe((event) => events.push(event))
    registry.registerTerminal(terminal)

    recordStatus(registry, identity, 1, 'unavailable')
    expect(registry.query(terminal)).toMatchObject({
      invocations: [expect.objectContaining({ invocationId: identity.invocationId })],
      revision: 1,
      status: 'unavailable'
    })

    expect(
      registry.record({
        identity,
        signal: { type: 'invocation_exited' },
        sourceRevision: 2
      })
    ).toBe(true)
    expect(registry.query(terminal)).toMatchObject({
      invocations: [],
      revision: 2,
      status: 'unavailable'
    })
    expect(
      events.flatMap((event) =>
        event.type === 'activity_changed'
          ? [
              {
                invocationCount: event.snapshot.invocations.length,
                revision: event.snapshot.revision,
                status: event.snapshot.status
              }
            ]
          : []
      )
    ).toEqual([
      { invocationCount: 0, revision: 0, status: 'unavailable' },
      { invocationCount: 1, revision: 1, status: 'unavailable' },
      { invocationCount: 0, revision: 2, status: 'unavailable' }
    ])

    clock.advance(1_500)
    expect(events.filter(({ type }) => type === 'turn_completed')).toHaveLength(0)
  })

  it('never fabricates completion for invocation or terminal exit and cleans up subscriptions', () => {
    const clock = new FakeAgentActivityClock()
    const registry = new AgentActivityRegistry({ clock })
    const terminal = createTerminalScope()
    const identity = createActivityIdentity(terminal)
    const events: AgentActivityRegistryEvent[] = []
    const unsubscribe = registry.subscribe((event) => events.push(event))
    registry.registerTerminal(terminal)

    recordStatus(registry, identity, 1, 'working')
    expect(
      registry.record({
        identity,
        signal: { type: 'invocation_exited' },
        sourceRevision: 2
      })
    ).toBe(true)
    clock.advance(1_500)
    expect(events.filter(({ type }) => type === 'turn_completed')).toHaveLength(0)
    expect(registry.query(terminal)?.status).toBe('unavailable')
    expect(registry.query(terminal)?.invocations).toEqual([])
    expect(
      registry.record({
        identity,
        signal: { status: 'working', type: 'status_changed' },
        sourceRevision: 3
      })
    ).toBe(false)

    const replacementIdentity = createActivityIdentity(terminal, { invocationId: 'invocation-2' })
    recordStatus(registry, replacementIdentity, 1, 'working')
    recordStatus(registry, replacementIdentity, 2, 'idle')
    expect(registry.releaseTerminal(terminal)).toBe(true)
    clock.advance(1_500)
    expect(events.filter(({ type }) => type === 'turn_completed')).toHaveLength(0)
    expect(registry.query(terminal)).toMatchObject({
      invocations: [],
      status: 'unavailable'
    })
    expect(registry.registerTerminal(terminal)).toBeNull()

    const eventCount = events.length
    unsubscribe()
    unsubscribe()
    const nextTerminal = createTerminalScope({
      generation: 2,
      runId: 'terminal-run-2',
      sessionId: 'terminal-session-2'
    })
    registry.registerTerminal(nextTerminal)
    recordStatus(registry, createActivityIdentity(nextTerminal), 1, 'working')
    expect(events).toHaveLength(eventCount)
  })
})

function createTerminalScope(
  overrides: Partial<AgentActivityTerminalScope> = {}
): AgentActivityTerminalScope {
  return {
    blockId: 'terminal-block-1',
    generation: 1,
    gitBranch: 'main',
    owner: { id: 'terminal-block-1', kind: 'block' },
    projectDirectory: '/project',
    projectId: 'project-1',
    runId: 'terminal-run-1',
    sessionId: 'terminal-session-1',
    workspaceDirectory: '/workspace',
    workspaceId: 'workspace-1',
    ...overrides
  }
}

function createActivityIdentity(
  terminal: AgentActivityTerminalScope,
  overrides: Partial<Omit<AgentActivityIdentity, 'terminal'>> = {}
): AgentActivityIdentity {
  return {
    invocationId: 'invocation-1',
    providerId: 'fixture-provider',
    terminal,
    ...overrides
  }
}

function recordStatus(
  registry: AgentActivityRegistry,
  identity: AgentActivityIdentity,
  sourceRevision: number,
  status: 'idle' | 'unavailable' | 'waiting_approval' | 'waiting_input' | 'working'
): void {
  expect(
    registry.record({
      identity,
      signal: { status, type: 'status_changed' },
      sourceRevision
    })
  ).toBe(true)
}

class FakeAgentActivityClock implements AgentActivityRegistryClock {
  private currentTime = 0
  private nextTaskId = 0
  private readonly tasks = new Map<
    number,
    { readonly callback: () => void; readonly dueAt: number }
  >()

  now(): number {
    return this.currentTime
  }

  schedule(callback: () => void, delayMs: number): AgentActivityScheduledTask {
    const taskId = ++this.nextTaskId
    this.tasks.set(taskId, { callback, dueAt: this.currentTime + delayMs })
    return {
      cancel: () => {
        this.tasks.delete(taskId)
      }
    }
  }

  advance(milliseconds: number): void {
    const targetTime = this.currentTime + milliseconds
    while (true) {
      const nextTask = [...this.tasks.entries()]
        .filter(([, task]) => task.dueAt <= targetTime)
        .sort(([leftId, left], [rightId, right]) => left.dueAt - right.dueAt || leftId - rightId)[0]
      if (!nextTask) break
      this.tasks.delete(nextTask[0])
      this.currentTime = nextTask[1].dueAt
      nextTask[1].callback()
    }
    this.currentTime = targetTime
  }
}
