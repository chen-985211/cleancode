import type {
  AgentActivityTerminalScope,
  AgentTurnCompletedEvent,
  TerminalAgentActivitySnapshot
} from '../../../../src/contexts/agent/application/dto/AgentActivityProtocol'
import { AgentActivityStore } from '../../../../src/contexts/agent/presentation/view-models/agentActivityStore'

describe('AgentActivityStore', () => {
  it('establishes a quiet baseline and only projects a new attention transition', () => {
    const store = new AgentActivityStore()
    const listener = vi.fn()
    store.subscribe(listener)

    store.establishBaseline([createSnapshot({ revision: 3, status: 'waiting_input' })])

    expect(store.getSnapshots()).toMatchObject([{ revision: 3, status: 'waiting_input' }])
    expect(listener).toHaveBeenCalledOnce()

    expect(store.recordActivity(createSnapshot({ revision: 3, status: 'working' }))).toBeNull()
    expect(store.getSnapshots()).toMatchObject([{ revision: 3, status: 'waiting_input' }])

    expect(
      store.recordActivity(createSnapshot({ revision: 4, status: 'waiting_input' }))
    ).toBeNull()
    expect(store.getSnapshots()).toMatchObject([{ revision: 4, status: 'waiting_input' }])

    expect(store.recordActivity(createSnapshot({ revision: 5, status: 'working' }))).toEqual({
      messageKey: expect.stringContaining('agent-activity:'),
      type: 'attention_resolved'
    })
    expect(store.getSnapshots()).toMatchObject([{ revision: 5, status: 'working' }])

    const attention = store.recordActivity(
      createSnapshot({ revision: 6, status: 'waiting_approval' })
    )

    expect(attention).toMatchObject({
      messageIdentity: {
        occurrenceId: expect.stringContaining('waiting_approval'),
        revision: 6
      },
      status: 'waiting_approval',
      type: 'attention'
    })
    if (attention?.type !== 'attention') throw new Error('Expected an attention projection.')
    expect(store.getSnapshots()).toMatchObject([{ revision: 6, status: 'waiting_approval' }])

    const resolved = store.recordActivity(createSnapshot({ revision: 7, status: 'idle' }))

    expect(resolved).toEqual({
      messageKey: attention.messageIdentity.key,
      type: 'attention_resolved'
    })
    expect(store.getSnapshots()).toMatchObject([{ revision: 7, status: 'idle' }])
  })

  it('replays an exactly baselined live attention fact without republishing snapshot state', () => {
    const store = new AgentActivityStore()
    const listener = vi.fn()
    store.subscribe(listener)
    const waiting = createSnapshot({
      generation: 2,
      revision: 4,
      sessionId: 'session-2',
      status: 'waiting_input'
    })
    store.establishBaseline([waiting])
    listener.mockClear()

    const first = store.recordLiveActivity(waiting)
    const repeated = store.recordLiveActivity(waiting)

    expect(first).toMatchObject({
      messageIdentity: { revision: 4 },
      status: 'waiting_input',
      type: 'attention'
    })
    expect(repeated).toMatchObject({
      messageIdentity: {
        occurrenceId:
          first?.type === 'attention' ? first.messageIdentity.occurrenceId : 'missing-occurrence'
      },
      type: 'attention'
    })
    expect(listener).not.toHaveBeenCalled()
    expect(store.getSnapshots()).toEqual([waiting])
    expect(
      store.recordLiveActivity(
        createSnapshot({
          generation: 2,
          revision: 3,
          sessionId: 'session-2',
          status: 'waiting_input'
        })
      )
    ).toBeNull()
    expect(
      store.recordLiveActivity(
        createSnapshot({ generation: 1, revision: 99, status: 'waiting_approval' })
      )
    ).toBeNull()
  })

  it('rejects stale terminal generations even when they carry a higher revision', () => {
    const store = new AgentActivityStore()
    store.establishBaseline([
      createSnapshot({ generation: 2, revision: 2, sessionId: 'session-2', status: 'working' })
    ])

    const stale = store.recordActivity(
      createSnapshot({
        generation: 1,
        revision: 99,
        sessionId: 'session-1',
        status: 'waiting_input'
      })
    )

    expect(stale).toBeNull()
    expect(store.getSnapshots()).toMatchObject([
      {
        revision: 2,
        status: 'working',
        terminal: { generation: 2, sessionId: 'session-2' }
      }
    ])

    const replacement = store.recordActivity(
      createSnapshot({
        generation: 3,
        revision: 1,
        sessionId: 'session-3',
        status: 'waiting_input'
      })
    )

    expect(replacement).toMatchObject({ status: 'waiting_input', type: 'attention' })
    expect(store.getSnapshots()).toMatchObject([
      {
        revision: 1,
        status: 'waiting_input',
        terminal: { generation: 3, sessionId: 'session-3' }
      }
    ])
  })

  it('updates attention metadata with the same occurrence identity', () => {
    const store = new AgentActivityStore()
    store.establishBaseline([createSnapshot({ revision: 1, status: 'idle' })])

    const attention = store.recordActivity(
      createSnapshot({ agentName: 'Agent 1', revision: 2, status: 'waiting_input' })
    )
    if (attention?.type !== 'attention') throw new Error('Expected an attention projection.')

    const renamed = store.recordActivity(
      createSnapshot({ agentName: 'Renamed Agent', revision: 3, status: 'waiting_input' })
    )

    expect(renamed).toMatchObject({
      messageIdentity: {
        occurrenceId: attention.messageIdentity.occurrenceId,
        revision: 3
      },
      source: { agentName: 'Renamed Agent' },
      status: 'waiting_input',
      type: 'attention'
    })
  })

  it('resolves attention when a newer terminal replaces the current identity', () => {
    const store = new AgentActivityStore()
    store.establishBaseline([
      createSnapshot({
        generation: 2,
        revision: 2,
        sessionId: 'session-2',
        status: 'working'
      })
    ])
    const attention = store.recordActivity(
      createSnapshot({
        generation: 2,
        revision: 3,
        sessionId: 'session-2',
        status: 'waiting_input'
      })
    )
    if (attention?.type !== 'attention') throw new Error('Expected an attention projection.')

    const resolved = store.recordActivity(
      createSnapshot({
        generation: 3,
        revision: 1,
        sessionId: 'session-3',
        status: 'unavailable'
      })
    )

    expect(resolved).toEqual({
      messageKey: attention.messageIdentity.key,
      type: 'attention_resolved'
    })
  })

  it('keeps a completion from one invocation after another advances the terminal baseline', () => {
    const store = new AgentActivityStore()
    store.establishBaseline([
      createSnapshot({ invocationId: 'invocation-b', revision: 4, status: 'working' })
    ])
    store.recordActivity(
      createSnapshot({ invocationId: 'invocation-b', revision: 5, status: 'idle' })
    )
    const completion = createCompletion({
      completionId: 'completion-a',
      invocationId: 'invocation-a',
      terminalRevision: 2
    })

    const projected = store.recordCompletion(completion)

    expect(projected).toMatchObject({
      messageIdentity: {
        occurrenceId: 'completion-a',
        revision: 2
      },
      type: 'turn_completed'
    })
    expect(store.recordCompletion(completion)).toBeNull()

    store.recordActivity(
      createSnapshot({
        generation: 2,
        invocationId: 'invocation-b',
        revision: 1,
        status: 'working'
      })
    )

    expect(
      store.recordCompletion(
        createCompletion({
          completionId: 'completion-from-replaced-terminal',
          invocationId: 'invocation-a',
          terminalRevision: 6
        })
      )
    ).toBeNull()
  })

  it('keeps attention and independent invocation completions in separate message slots', () => {
    const store = new AgentActivityStore()
    store.establishBaseline([createSnapshot({ revision: 1, status: 'idle' })])

    const attention = store.recordActivity(
      createSnapshot({ invocationId: 'invocation-a', revision: 2, status: 'waiting_input' })
    )
    const completionB = store.recordCompletion(
      createCompletion({
        completionId: 'completion-b',
        invocationId: 'invocation-b',
        terminalRevision: 2
      })
    )
    const completionA = store.recordCompletion(
      createCompletion({
        completionId: 'completion-a',
        invocationId: 'invocation-a',
        terminalRevision: 2
      })
    )

    if (attention?.type !== 'attention') throw new Error('Expected an attention projection.')
    if (completionA?.type !== 'turn_completed') {
      throw new Error('Expected invocation A completion projection.')
    }
    if (completionB?.type !== 'turn_completed') {
      throw new Error('Expected invocation B completion projection.')
    }
    expect(attention.messageIdentity.key).toContain('agent-activity:attention:')
    expect(completionA.messageIdentity.key).toContain('agent-activity:completion:')
    expect(completionB.messageIdentity.key).toContain('agent-activity:completion:')
    expect(completionA.messageIdentity.key).not.toBe(completionB.messageIdentity.key)
    expect(completionB.messageIdentity.key).not.toBe(attention.messageIdentity.key)

    const stillWaiting = store.recordActivity(
      createSnapshot({ invocationId: 'invocation-a', revision: 3, status: 'waiting_input' })
    )
    expect(stillWaiting).toMatchObject({
      messageIdentity: { key: attention.messageIdentity.key },
      type: 'attention'
    })
  })
})

function createSnapshot({
  agentName,
  generation = 1,
  invocationId = 'invocation-1',
  revision,
  sessionId = `session-${generation}`,
  status
}: {
  readonly agentName?: string
  readonly generation?: number
  readonly invocationId?: string
  readonly revision: number
  readonly sessionId?: string
  readonly status: TerminalAgentActivitySnapshot['status']
}): TerminalAgentActivitySnapshot {
  return {
    invocations: [
      {
        invocationId,
        ...(agentName
          ? {
              managed: {
                agentId: 'agent-1',
                agentName,
                agentSessionId: 'agent-session-1',
                providerLaunchGeneration: 1
              }
            }
          : {}),
        providerId: 'codex',
        status
      }
    ],
    revision,
    status,
    terminal: createTerminal({ generation, sessionId })
  }
}

function createCompletion({
  completionId,
  invocationId = 'invocation-1',
  terminalRevision
}: {
  readonly completionId: string
  readonly invocationId?: string
  readonly terminalRevision: number
}): AgentTurnCompletedEvent {
  return {
    completedAt: 1_000,
    completionId,
    identity: {
      invocationId,
      providerId: 'provider-neutral',
      terminal: createTerminal()
    },
    reason: 'reported',
    terminalRevision
  }
}

function createTerminal(
  overrides: Partial<AgentActivityTerminalScope> = {}
): AgentActivityTerminalScope {
  return {
    blockId: 'terminal-1',
    generation: 1,
    gitBranch: 'main',
    owner: { id: 'terminal-1', kind: 'block' },
    projectDirectory: '/tmp/project',
    projectId: 'project-1',
    runId: 'run-1',
    sessionId: 'session-1',
    workspaceDirectory: '/tmp/project',
    workspaceId: 'workspace-1',
    ...overrides
  }
}
