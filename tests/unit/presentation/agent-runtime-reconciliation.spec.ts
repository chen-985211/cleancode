import type {
  AgentRuntimeChangedEvent,
  AgentSessionSnapshot
} from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import {
  applyAgentRuntimeEvent,
  maxPendingAgentRuntimeEvents,
  rememberLatestAgentRuntimeEvent
} from '../../../src/presentation/app-shell/agentRuntimeReconciliation'

describe('Agent runtime reconciliation', () => {
  it('rejects an older launch generation even when its event has a higher revision', () => {
    const session = createSession('session-1', 2, 4)

    expect(applyAgentRuntimeEvent(session, createEvent('session-1', 1, 5))).toBe(session)
  })

  it('accepts a reset Run launch generation after the Agent terminal identity changes', () => {
    const session = createSession('session-1', 3, 4, 1)
    const event = createEvent('session-1', 1, 5, 2)

    expect(applyAgentRuntimeEvent(session, event).runtime).toBe(event.runtime)
  })

  it('keeps only the latest event per session and evicts the oldest session at the bound', () => {
    const events = new Map<string, AgentRuntimeChangedEvent>()
    rememberLatestAgentRuntimeEvent(events, createEvent('session-0', 1, 2))
    rememberLatestAgentRuntimeEvent(events, createEvent('session-0', 1, 1))

    for (let index = 1; index <= maxPendingAgentRuntimeEvents; index += 1) {
      rememberLatestAgentRuntimeEvent(events, createEvent(`session-${index}`, 1, 1))
    }

    expect(events).toHaveLength(maxPendingAgentRuntimeEvents)
    expect(events.has('session-0')).toBe(false)
    expect(events.get(`session-${maxPendingAgentRuntimeEvents}`)?.runtime.revision).toBe(1)
  })
})

function createSession(
  sessionId: string,
  generation: number,
  revision: number,
  terminalGeneration = 1
): AgentSessionSnapshot {
  return {
    agentId: 'agent-1',
    gitBranch: null,
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    providerId: 'codex',
    providerSessionRef: null,
    runtime: createEvent(sessionId, generation, revision, terminalGeneration).runtime,
    sessionId,
    terminalSourceTheme: 'dark',
    workspaceDirectory: '/repo/app',
    workspaceName: 'main'
  }
}

function createEvent(
  sessionId: string,
  generation: number,
  revision: number,
  terminalGeneration = 1
): AgentRuntimeChangedEvent {
  return {
    agentId: 'agent-1',
    runtime: {
      activity: { status: 'unavailable' },
      binding: { status: 'unbound' },
      launch: {
        exitCode: null,
        failureKind: null,
        generation,
        launchId: `launch-${sessionId}-${generation}`,
        status: 'running'
      },
      mcp: { status: 'ready' },
      revision,
      terminal: {
        exitCode: null,
        processId: 42,
        status: 'running',
        stopReason: null,
        viewIdentity: {
          blockId: 'agent-1',
          generation: terminalGeneration,
          owner: { id: 'agent-1', kind: 'agent' },
          projectId: 'project-1',
          runId: `run-${terminalGeneration}`,
          sessionId: `terminal-${terminalGeneration}`,
          workspaceName: 'main'
        }
      }
    },
    sessionId
  }
}
