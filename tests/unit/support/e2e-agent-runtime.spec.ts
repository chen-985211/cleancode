import type { AgentRuntimeChangedEvent } from '../../../src/contexts/agent/application/dto/AgentSessionProtocol'
import {
  getAgentLaunchReadySnapshot,
  getAgentRuntimeFailure,
  getAgentTerminalReadySnapshot
} from '../../support/e2eAgentRuntime'

describe('E2E Agent runtime readiness', () => {
  it('requires a running terminal and launch with a complete launch identity', () => {
    const event = createRuntimeEvent({
      launch: {
        generation: 3,
        launchId: 'launch-3',
        status: 'running'
      },
      terminal: {
        processId: 1234,
        status: 'running'
      }
    })

    expect(getAgentLaunchReadySnapshot(event)).toEqual({
      agentId: 'agent-1',
      generation: 3,
      launchId: 'launch-3',
      processId: 1234,
      sessionId: 'runtime-session-1'
    })
  })

  const notReadyCases: readonly [string, Parameters<typeof createRuntimeEvent>[0]][] = [
    ['terminal is starting', { terminal: { status: 'starting' } }],
    ['launch is launching', { launch: { status: 'launching' } }],
    ['launch identity is incomplete', { launch: { launchId: null } }],
    ['terminal process identity is missing', { terminal: { processId: null } }]
  ]

  it.each(notReadyCases)('does not accept ready state when %s', (_description, overrides) => {
    const event = createRuntimeEvent(overrides)

    expect(getAgentLaunchReadySnapshot(event)).toBeNull()
  })

  it('reports terminal and launch failure states without waiting for a timeout', () => {
    expect(
      getAgentRuntimeFailure(
        createRuntimeEvent({ terminal: { status: 'failed' }, launch: { status: 'launching' } })
      )
    ).toContain('terminal status is failed')
    expect(
      getAgentRuntimeFailure(
        createRuntimeEvent({ terminal: { status: 'running' }, launch: { status: 'failed' } })
      )
    ).toContain('launch status is failed')
  })

  it('accepts the current rendered Agent terminal only with a complete stable identity', () => {
    expect(
      getAgentTerminalReadySnapshot({
        agentId: 'agent-1',
        processId: '1234',
        sessionId: 'runtime-session-1'
      })
    ).toEqual({
      agentId: 'agent-1',
      processId: 1234,
      sessionId: 'runtime-session-1'
    })

    expect(
      getAgentTerminalReadySnapshot({
        agentId: 'agent-1',
        sessionId: 'runtime-session-1'
      })
    ).toBeNull()
    expect(
      getAgentTerminalReadySnapshot({
        agentId: 'agent-1',
        processId: 'not-a-process',
        sessionId: 'runtime-session-1'
      })
    ).toBeNull()
    expect(getAgentTerminalReadySnapshot(null)).toBeNull()
  })
})

function createRuntimeEvent(
  overrides: {
    readonly launch?: Partial<AgentRuntimeChangedEvent['runtime']['launch']>
    readonly terminal?: Partial<AgentRuntimeChangedEvent['runtime']['terminal']>
  } = {}
): AgentRuntimeChangedEvent {
  return {
    agentId: 'agent-1',
    runtime: {
      activity: { status: 'unavailable' },
      binding: { status: 'unbound' },
      launch: {
        exitCode: null,
        failureKind: null,
        generation: 0,
        launchId: null,
        status: 'not_started',
        ...overrides.launch
      },
      mcp: { status: 'disabled' },
      revision: 1,
      terminal: {
        exitCode: null,
        processId: null,
        status: 'not_started',
        stopReason: null,
        viewIdentity: null,
        ...overrides.terminal
      }
    },
    sessionId: 'runtime-session-1'
  }
}
