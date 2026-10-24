import { AgentSessionBindingStore } from '../../../src/presentation/app-shell/coordinators/agentSessionBindingStore'
import { createAgentSessionSnapshot } from '../../fixtures/presentation/appShellFixtures'

const agent = {
  agentId: 'agent-1',
  projectId: 'project-1',
  workspaceId: 'main',
  providerId: 'codex',
  name: 'Agent 1',
  cleancodeMcpEnabled: true,
  layout: { position: { x: 0, y: 0 }, size: { width: 640, height: 360 } }
}
const identity = {
  blockId: agent.agentId,
  projectId: agent.projectId,
  workspaceId: agent.workspaceId,
  owner: { id: agent.agentId, kind: 'agent' as const },
  generation: 1,
  runId: 'run-1',
  sessionId: 'pty-1'
}
const session = createAgentSessionSnapshot({
  runtime: {
    ...createAgentSessionSnapshot().runtime,
    terminal: { ...createAgentSessionSnapshot().runtime.terminal, viewIdentity: identity }
  }
})
const binding = { session, agentName: agent.name, workspaceKey: 'scope' }

it('keeps hidden runtime events current without accepting stale revisions', () => {
  const store = new AgentSessionBindingStore({ hasRetained: () => true, forget: vi.fn() })
  store.remember(binding)
  store.accept({
    agentId: agent.agentId,
    sessionId: session.sessionId,
    runtime: {
      ...session.runtime,
      revision: 2,
      activity: { status: 'waiting_input' }
    }
  })
  store.accept({ agentId: agent.agentId, sessionId: session.sessionId, runtime: session.runtime })
  expect(store.read('scope', agent)?.session.runtime.activity.status).toBe('waiting_input')
  expect(store.read('scope', { ...agent, providerId: 'another-provider' })).toBeNull()
  expect(store.read('scope', { ...agent, workspaceId: 'another-workspace' })).toBeNull()
})

it.each(['exited', 'suspended', 'failed', 'replacement'] as const)(
  'invalidates a hidden binding on %s',
  (status) => {
    const forget = vi.fn()
    const store = new AgentSessionBindingStore({
      hasRetained: (candidate) => candidate.sessionId === identity.sessionId,
      forget
    })
    store.remember(binding)
    store.accept({
      agentId: agent.agentId,
      sessionId: session.sessionId,
      runtime: {
        ...session.runtime,
        revision: 2,
        terminal: {
          ...session.runtime.terminal,
          status: status === 'replacement' ? 'running' : status,
          viewIdentity:
            status === 'replacement' ? { ...identity, generation: 2, sessionId: 'pty-2' } : null
        }
      }
    })
    expect(forget).toHaveBeenCalledWith(identity)
    expect(store.read('scope', agent)).toBeNull()
  }
)

it('drops evicted projections and never revives them if a later view has the same owner', () => {
  let retained = true
  const store = new AgentSessionBindingStore({ hasRetained: () => retained, forget: vi.fn() })
  store.remember(binding)
  retained = false
  store.prune()
  retained = true
  expect(store.read('scope', agent)).toBeNull()
})

it('allows terminal cleanup to retain a view after its console cleanup in the same commit', async () => {
  let retained = false
  const store = new AgentSessionBindingStore({ hasRetained: () => retained, forget: vi.fn() })
  const release = store.acquire('scope')
  store.remember(binding)
  store.prune()
  release()
  retained = true
  await Promise.resolve()
  expect(store.read('scope', agent)?.session.sessionId).toBe(session.sessionId)
})
