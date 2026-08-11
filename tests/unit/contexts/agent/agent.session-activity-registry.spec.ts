import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import { AgentActivityRegistry } from '../../../../src/contexts/agent/application/services/AgentActivityRegistry'
import { AgentProviderAvailabilityService } from '../../../../src/contexts/agent/application/services/AgentProviderAvailabilityService'
import { allowAgentRuntimeScope } from '../../../../src/contexts/agent/application/ports/AgentRuntimeScopeValidationPort'
import { defaultAgentProviderPreferencesRepository } from '../../../../src/contexts/agent/application/ports/AgentProviderPreferencesRepository'
import type { AgentMcpServerPort } from '../../../../src/contexts/agent/application/ports/AgentMcpServerPort'
import {
  RecordingAgentProviderRegistry,
  RecordingAgentTerminalRuntime
} from '../../../fixtures/agentTerminalRuntime'
import { createAgentSessionRepository } from './agent.execute-tool-fixtures'

describe('Agent session activity registry integration', () => {
  it('registers the managed terminal and records only the current Provider launch lifecycle', async () => {
    const terminalRuntime = new RecordingAgentTerminalRuntime()
    const providers = new RecordingAgentProviderRegistry('codex', { activityTracking: true })
    const activityRegistry = new AgentActivityRegistry({ quietWindowMs: 60_000 })
    const registerTerminal = vi.spyOn(activityRegistry, 'registerTerminal')
    const record = vi.spyOn(activityRegistry, 'record')
    const releaseTerminal = vi.spyOn(activityRegistry, 'releaseTerminal')
    const service = createService({ activityRegistry, providers, terminalRuntime })

    const session = await attach(service)
    const terminal = {
      blockId: 'agent-1',
      generation: 1,
      gitBranch: 'main',
      owner: { id: 'agent-1', kind: 'agent' as const },
      projectDirectory: '/repo/app',
      projectId: 'project-1',
      runId: 'run-1',
      sessionId: 'terminal-1',
      workspaceDirectory: '/repo/app',
      workspaceId: 'main'
    }

    expect(registerTerminal).toHaveBeenCalledWith(terminal)
    expect(activityRegistry.query(terminal)).toMatchObject({
      invocations: [
        {
          invocationId: `managed:${session.sessionId}:1`,
          providerId: 'codex',
          status: 'idle'
        }
      ],
      revision: 1,
      status: 'idle'
    })

    const firstProviderLaunch = providers.launchCommands[0]!
    firstProviderLaunch.onActivityChanged?.('working')
    firstProviderLaunch.onTurnCompleted?.()

    expect(
      service.updateMetadata({
        agentId: 'agent-1',
        agentName: 'Renamed Agent',
        sessionId: session.sessionId
      })
    ).toBe(true)
    expect(terminalRuntime.launches).toHaveLength(1)
    expect(providers.launchCommands).toHaveLength(1)

    expect(activityRegistry.query(terminal)).toMatchObject({
      invocations: [
        {
          invocationId: `managed:${session.sessionId}:1`,
          managed: {
            agentId: 'agent-1',
            agentName: 'Renamed Agent',
            agentSessionId: session.sessionId,
            providerLaunchGeneration: 1
          },
          providerId: 'codex',
          status: 'idle'
        }
      ],
      revision: 4,
      status: 'idle'
    })

    terminalRuntime.launches[0]!.onExit({
      exitCode: 0,
      generation: 1,
      launchId: 'launch-1'
    })
    expect(activityRegistry.query(terminal)?.status).toBe('unavailable')

    await attach(service, { agentName: 'Renamed Agent', restartMode: 'retry' })
    const secondProviderLaunch = providers.launchCommands[1]!
    const callCountBeforeStaleSignals = record.mock.calls.length
    firstProviderLaunch.onActivityChanged?.('waiting_approval')
    firstProviderLaunch.onTurnCompleted?.()
    expect(record).toHaveBeenCalledTimes(callCountBeforeStaleSignals)

    secondProviderLaunch.onActivityChanged?.('working')
    expect(activityRegistry.query(terminal)?.status).toBe('working')
    terminalRuntime.launches[1]!.onExit({
      exitCode: 0,
      generation: 2,
      launchId: 'launch-2'
    })

    expect(
      record.mock.calls.map(([command]) => ({
        generation: command.identity.managed?.providerLaunchGeneration,
        signal: command.signal,
        sourceRevision: command.sourceRevision
      }))
    ).toEqual([
      {
        generation: 1,
        signal: { status: 'idle', type: 'status_changed' },
        sourceRevision: 1
      },
      {
        generation: 1,
        signal: { status: 'working', type: 'status_changed' },
        sourceRevision: 2
      },
      { generation: 1, signal: { type: 'turn_completed' }, sourceRevision: 3 },
      { generation: 1, signal: { type: 'invocation_exited' }, sourceRevision: 4 },
      {
        generation: 2,
        signal: { status: 'idle', type: 'status_changed' },
        sourceRevision: 1
      },
      {
        generation: 2,
        signal: { status: 'working', type: 'status_changed' },
        sourceRevision: 2
      },
      { generation: 2, signal: { type: 'invocation_exited' }, sourceRevision: 3 }
    ])

    terminalRuntime.opens[0]!.onTerminalExit(0)
    expect(releaseTerminal).toHaveBeenCalledWith(terminal)
    expect(activityRegistry.query(terminal)).toMatchObject({
      invocations: [],
      status: 'unavailable'
    })
    const callCountAfterTerminalExit = record.mock.calls.length
    secondProviderLaunch.onActivityChanged?.('idle')
    expect(record).toHaveBeenCalledTimes(callCountAfterTerminalExit)
  })

  it('keeps completion-only Providers unavailable while still recording completion', async () => {
    const terminalRuntime = new RecordingAgentTerminalRuntime()
    const providers = new RecordingAgentProviderRegistry()
    const activityRegistry = new AgentActivityRegistry({ quietWindowMs: 60_000 })
    const record = vi.spyOn(activityRegistry, 'record')
    const service = createService({ activityRegistry, providers, terminalRuntime })

    const session = await attach(service)
    const terminal = {
      blockId: 'agent-1',
      generation: 1,
      gitBranch: 'main',
      owner: { id: 'agent-1', kind: 'agent' as const },
      projectDirectory: '/repo/app',
      projectId: 'project-1',
      runId: 'run-1',
      sessionId: 'terminal-1',
      workspaceDirectory: '/repo/app',
      workspaceId: 'main'
    }

    expect(activityRegistry.query(terminal)).toMatchObject({
      invocations: [],
      status: 'unavailable'
    })

    providers.launchCommands[0]!.onTurnCompleted?.()

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ signal: { type: 'turn_completed' }, sourceRevision: 1 })
    )
    expect(activityRegistry.query(terminal)).toMatchObject({
      invocations: [
        expect.objectContaining({
          invocationId: `managed:${session.sessionId}:1`,
          providerId: 'codex',
          status: 'unavailable'
        })
      ],
      status: 'unavailable'
    })
  })
})

function createService(input: {
  readonly activityRegistry: AgentActivityRegistry
  readonly providers: RecordingAgentProviderRegistry
  readonly terminalRuntime: RecordingAgentTerminalRuntime
}): AgentSessionService {
  return new AgentSessionService(
    input.terminalRuntime,
    createMcpServer(),
    {
      cancel: async () => {
        throw new Error('Not used by this fixture.')
      },
      execute: async () => {
        throw new Error('Not used by this fixture.')
      }
    },
    createAgentSessionRepository(),
    input.providers,
    'codex',
    allowAgentRuntimeScope,
    new AgentProviderAvailabilityService(input.providers),
    defaultAgentProviderPreferencesRepository,
    input.activityRegistry
  )
}

function createMcpServer(): AgentMcpServerPort {
  return {
    dispose: () => undefined,
    registerSession: async (session) => ({
      bearerToken: `token-${session.sessionId}`,
      dispose: () => undefined,
      url: `http://127.0.0.1/mcp/${session.sessionId}`
    })
  }
}

function attach(
  service: AgentSessionService,
  overrides: { readonly agentName?: string; readonly restartMode?: 'new' | 'retry' } = {}
) {
  return service.attach({
    agentId: 'agent-1',
    agentName: 'Agent 1',
    columns: 80,
    gitBranch: 'main',
    onGraphUpdated: () => undefined,
    onRuntimeChanged: () => undefined,
    onToolApprovalRequested: () => undefined,
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    rows: 24,
    terminalSourceTheme: 'light',
    workspaceDirectory: '/repo/app',
    workspaceId: 'main',
    ...overrides
  })
}
