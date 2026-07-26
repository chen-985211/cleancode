import { AgentConversationScope } from '../../../../src/contexts/agent/domain/value-objects/AgentConversationScope'
import type {
  AgentRuntimeChangedEvent,
  AgentTerminalStopReason
} from '../../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import {
  beginAgentTerminalRuntime,
  createInitialAgentRuntime,
  recordAgentSessionStartFailure,
  recordAgentSessionStopFailure,
  recordAgentTerminalExit,
  recordAgentTerminalRunning,
  recordAgentTerminalStartFailure,
  recordAgentTerminalStopped,
  transitionAgentRuntime,
  type ManagedAgentSession
} from '../../../../src/contexts/agent/application/use-cases/AgentSessionRuntimeState'

describe('Agent terminal stop reason', () => {
  it('publishes a runtime change when only the stop reason differs', () => {
    const { session, events } = createSession()
    recordAgentTerminalRunning(session, session.sessionId, { processId: 42 })
    const revisionBeforeStop = session.runtime.revision
    const eventsBeforeStop = events.length

    transitionAgentRuntime(session, {
      terminal: { status: 'exited', stopReason: 'unexpected' }
    })

    expect(session.runtime.revision).toBeGreaterThan(revisionBeforeStop)
    expect(events).toHaveLength(eventsBeforeStop + 1)
    expect(session.runtime.terminal.stopReason).toBe('unexpected')

    const revisionBeforeReason = session.runtime.revision
    transitionAgentRuntime(session, {
      terminal: { status: 'exited', stopReason: 'requested' }
    })

    expect(session.runtime.terminal.stopReason).toBe('requested')
    expect(session.runtime.revision).toBeGreaterThan(revisionBeforeReason)
    expect(events).toHaveLength(eventsBeforeStop + 2)
  })

  it('leaves the stop reason absent while the terminal has not stopped', () => {
    const { session } = createSession()
    expect(session.runtime.terminal.stopReason).toBeNull()

    beginAgentTerminalRuntime(session)
    expect(session.runtime.terminal.stopReason).toBeNull()

    recordAgentTerminalRunning(session, session.sessionId, { processId: 42 })
    expect(session.runtime.terminal.stopReason).toBeNull()
  })

  it.each([
    ['Agent removal', 'exited'],
    ['workspace ownership handover', 'suspended']
  ] as const)('records an application requested stop for %s', (_scenario, status) => {
    const { session } = createSession()
    recordAgentTerminalRunning(session, session.sessionId, { processId: 42 })
    session.isStopping = true

    recordAgentTerminalStopped(session, status)

    expect(session.runtime.terminal.status).toBe(status)
    expect(session.runtime.terminal.stopReason).toBe<AgentTerminalStopReason>('requested')
  })

  it('records an unexpected stop when the PTY exits on its own', () => {
    const { session } = createSession()
    recordAgentTerminalRunning(session, session.sessionId, { processId: 42 })

    recordAgentTerminalExit(session, session.sessionId, 137)

    expect(session.runtime.terminal.status).toBe('exited')
    expect(session.runtime.terminal.stopReason).toBe<AgentTerminalStopReason>('unexpected')
  })

  it('keeps a PTY exit during an in-flight stop attributed to the request', () => {
    const { session } = createSession()
    recordAgentTerminalRunning(session, session.sessionId, { processId: 42 })
    session.isStopping = true

    recordAgentTerminalExit(session, session.sessionId, 1)

    expect(session.runtime.terminal.stopReason).toBe<AgentTerminalStopReason>('requested')
  })

  it('drops a stale stop reason when cleanup failure marks the terminal failed', () => {
    const { session } = createSession()
    recordAgentTerminalRunning(session, session.sessionId, { processId: 42 })
    session.isStopping = true
    recordAgentTerminalExit(session, session.sessionId, 0)
    expect(session.runtime.terminal.stopReason).toBe<AgentTerminalStopReason>('requested')

    recordAgentSessionStopFailure(session)

    expect(session.runtime.terminal.status).toBe('failed')
    expect(session.runtime.terminal.stopReason).toBeNull()
  })

  it('drops a stale stop reason when a suspended session cannot be resumed', () => {
    const { session } = createSession()
    recordAgentTerminalRunning(session, session.sessionId, { processId: 42 })
    session.isStopping = true
    recordAgentTerminalStopped(session, 'suspended')
    expect(session.runtime.terminal.stopReason).toBe<AgentTerminalStopReason>('requested')

    recordAgentSessionStartFailure(session)

    expect(session.runtime.terminal.status).toBe('failed')
    expect(session.runtime.terminal.stopReason).toBeNull()
  })

  it('does not attribute a stop reason to a terminal that never started', () => {
    const { session } = createSession()
    beginAgentTerminalRuntime(session)

    recordAgentTerminalStartFailure(session)

    expect(session.runtime.terminal.status).toBe('failed')
    expect(session.runtime.terminal.stopReason).toBeNull()
  })
})

function createSession(): {
  readonly events: AgentRuntimeChangedEvent[]
  readonly session: ManagedAgentSession
} {
  const events: AgentRuntimeChangedEvent[] = []
  const scope = AgentConversationScope.create({
    agentId: 'agent-1',
    projectId: 'project-1',
    workspaceId: 'main'
  })
  const session: ManagedAgentSession = {
    agentId: 'agent-1',
    callbacks: {
      onGraphUpdated: () => undefined,
      onRuntimeChanged: (event) => events.push(event),
      onToolApprovalRequested: () => undefined
    },
    cleancodeMcpEnabled: false,
    columns: 88,
    gitBranch: null,
    isStopping: false,
    isTerminalRunning: false,
    launchArtifacts: null,
    mcpSupported: false,
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    providerId: 'codex',
    providerLaunchGeneration: 0,
    providerSessionRef: null,
    rows: 24,
    runtime: createInitialAgentRuntime(),
    scope,
    sessionId: 'agent-session-1',
    shouldPersist: true,
    terminalSourceTheme: 'dark',
    workspaceDirectory: '/repo/app',
    workspaceId: 'main'
  }
  return { events, session }
}
