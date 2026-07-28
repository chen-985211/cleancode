import type {
  AgentMcpRegistration,
  AgentMcpServerPort,
  RegisteredAgentMcpSession
} from '../../../../src/contexts/agent/application/ports/AgentMcpServerPort'
import type {
  AgentProviderDescriptor,
  CreateAgentLaunchPlanCommand
} from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'
import type { AgentProviderRegistryPort } from '../../../../src/contexts/agent/application/ports/AgentProviderRegistryPort'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import type { AgentToolExecutionResult } from '../../../../src/contexts/agent/application/use-cases/ExecuteAgentToolUseCase'
import type { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import {
  ProviderSessionRef,
  type ProviderSessionRefSnapshot
} from '../../../../src/contexts/agent/domain/value-objects/ProviderSessionRef'
import { RecordingAgentTerminalRuntime } from '../../../fixtures/agentTerminalRuntime'

describe('Agent unified runtime readiness contract', () => {
  it('keeps the Provider launch usable while its supported MCP is initializing', async () => {
    const harness = createHarness()

    const beforeHandshake = await harness.service.attach(attachCommand())

    expect(beforeHandshake.runtime.launch.status).toBe('running')
    expect(beforeHandshake.runtime.mcp.status).toBe('initializing')
    expect(harness.terminal.launches).toHaveLength(1)

    harness.mcp.initialize(0)
    const ready = await harness.service.attach(attachCommand())

    expect(ready.runtime.mcp.status).toBe('ready')
    expect(ready.runtime.launch.status).toBe('running')
  })

  it('projects MCP registration failure without blocking the Provider launch', async () => {
    const harness = createHarness({
      registrationError: new Error('MCP registration failed')
    })

    const session = await harness.service.attach(attachCommand())

    expect(session.runtime.launch.status).toBe('running')
    expect(session.runtime.mcp.status).toBe('failed')
    expect(harness.terminal.launches).toHaveLength(1)
  })

  it('keeps a slow MCP registration available for a late handshake', async () => {
    vi.useFakeTimers()
    try {
      const harness = createHarness()
      await harness.service.attach(attachCommand())
      const registration = harness.mcp.registrations[0]!

      await vi.advanceTimersByTimeAsync(30_000)
      const degraded = await harness.service.attach(attachCommand())

      expect(degraded.runtime.launch.status).toBe('running')
      expect(degraded.runtime.mcp.status).toBe('degraded')
      expect(registration.dispose).not.toHaveBeenCalled()
      expect(harness.terminal.launches).toHaveLength(1)

      harness.mcp.initialize(0)
      const recovered = await harness.service.attach(attachCommand())
      expect(recovered.runtime.mcp.status).toBe('ready')
      expect(registration.dispose).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('starts the MCP slow-handshake deadline only after the Provider launch starts', async () => {
    vi.useFakeTimers()
    try {
      const terminal = new DeferredStartedAgentTerminalRuntime()
      const harness = createHarness({ terminal })
      await harness.service.attach(attachCommand())

      await vi.advanceTimersByTimeAsync(60_000)
      const beforeProviderStart = await harness.service.attach(attachCommand())
      expect(beforeProviderStart.runtime.mcp.status).toBe('initializing')
      expect(harness.mcp.registrations[0]?.dispose).not.toHaveBeenCalled()

      terminal.start()
      await vi.advanceTimersByTimeAsync(29_999)
      expect((await harness.service.attach(attachCommand())).runtime.mcp.status).toBe(
        'initializing'
      )

      await vi.advanceTimersByTimeAsync(1)
      expect((await harness.service.attach(attachCommand())).runtime.mcp.status).toBe('degraded')
      expect(harness.mcp.registrations[0]?.dispose).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not let an early MCP handshake report the Provider launch as started', async () => {
    const terminal = new DeferredStartedAgentTerminalRuntime()
    const harness = createHarness({ terminal })
    await harness.service.attach(attachCommand())

    harness.mcp.initialize(0)
    const beforeProviderStart = await harness.service.attach(attachCommand())

    expect(beforeProviderStart.runtime.mcp.status).toBe('ready')
    expect(beforeProviderStart.runtime.launch.status).toBe('launching')

    terminal.start()
    const afterProviderStart = await harness.service.attach(attachCommand())
    expect(afterProviderStart.runtime.launch.status).toBe('running')
  })

  it('projects Provider-session persistence failure only onto binding readiness', async () => {
    const harness = createHarness({ saveError: new Error('disk full') })
    await harness.service.attach(attachCommand())
    const providerLaunch = harness.providers.launchCommands[0]

    providerLaunch?.onActivityChanged?.('working')
    providerLaunch?.onProviderSessionIdentified({
      formatVersion: 1,
      kind: 'codex-thread',
      value: '0190d8a1-8b7d-7d75-9f62-7a663ef87e33'
    })
    await vi.waitFor(() => expect(harness.repository.save).toHaveBeenCalledOnce())
    await Promise.resolve()
    const session = await harness.service.attach(attachCommand())

    expect(session.runtime.binding.status).toBe('persistence_failed')
    expect(session.runtime.launch.status).toBe('running')
    expect(session.runtime.activity.status).toBe('working')
  })

  it('disposes each registration handle and ignores initialization from a replaced launch', async () => {
    const harness = createHarness()
    await harness.service.attach(attachCommand())
    const firstRegistration = harness.mcp.registrations[0]!

    const replacement = await harness.service.reconfigureAgent({
      agentId: 'agent-1',
      cleancodeMcpEnabled: true,
      projectId: 'project-1',
      workspaceId: 'main'
    })
    const secondRegistration = harness.mcp.registrations[1]!

    expect(firstRegistration.dispose).toHaveBeenCalledOnce()
    expect(secondRegistration.dispose).not.toHaveBeenCalled()
    expect(replacement?.runtime.mcp.status).toBe('initializing')
    expect(replacement?.runtime.launch.status).toBe('running')

    firstRegistration.command.onInitialized?.()
    const afterStaleHandshake = await harness.service.attach(attachCommand())
    expect(afterStaleHandshake.runtime.mcp.status).toBe('initializing')
    expect(afterStaleHandshake.runtime.launch.status).toBe('running')

    secondRegistration.command.onInitialized?.()
    const afterCurrentHandshake = await harness.service.attach(attachCommand())
    expect(afterCurrentHandshake.runtime.mcp.status).toBe('ready')
    expect(afterCurrentHandshake.runtime.launch.status).toBe('running')

    const lease = await harness.service.disposeAgent({
      agentId: 'agent-1',
      projectId: 'project-1',
      workspaceId: 'main'
    })
    lease.release()
    expect(secondRegistration.dispose).toHaveBeenCalledOnce()
  })
})

class DesiredProviderRegistry {
  readonly launchCommands: CreateAgentLaunchPlanCommand[] = []
  readonly registry: AgentProviderRegistryPort

  constructor() {
    const descriptor = {
      capabilities: {
        activityTracking: true,
        cleancodeMcp: true,
        launchInstructions: true,
        resume: true,
        sessionIdentityCapture: true,
        sessionRefCodec: true
      },
      displayName: 'Codex',
      icon: {
        paths: [{ d: 'M2 2h20v20H2z' }],
        viewBox: '0 0 24 24'
      },
      id: 'codex'
    } satisfies AgentProviderDescriptor
    const contribution = {
      cleancodeCapability: { inject: () => ({ args: [], env: {} }) },
      descriptor,
      detector: {
        inspect: async () => ({ providerId: 'codex', status: 'installed', version: 'test' })
      },
      launcher: {
        createLaunchPlan: async (command: CreateAgentLaunchPlanCommand) => {
          this.launchCommands.push(command)
          return { args: [], env: {}, executable: 'codex' }
        }
      },
      resume: { createResumeArgs: () => [] },
      sessionRefCodec: {
        parse: (sessionRef: Parameters<typeof ProviderSessionRef.create>[0]) => sessionRef
      }
    }
    this.registry = {
      inspect: contribution.detector.inspect,
      listDescriptors: () => [descriptor],
      parseSessionRef: (providerId: string, sessionRef: ProviderSessionRefSnapshot) =>
        ProviderSessionRef.create(contribution.sessionRefCodec.parse(sessionRef), providerId),
      require: () => contribution
    } as unknown as AgentProviderRegistryPort
  }
}

class RecordingMcpRegistrations implements AgentMcpServerPort {
  readonly registrations: Array<{
    readonly command: RegisteredAgentMcpSession
    readonly dispose: ReturnType<typeof vi.fn>
  }> = []

  constructor(private readonly registrationError?: Error) {}

  async registerSession(command: RegisteredAgentMcpSession): Promise<AgentMcpRegistration> {
    if (this.registrationError) throw this.registrationError
    const dispose = vi.fn()
    this.registrations.push({ command, dispose })
    return {
      bearerToken: `token-${command.sessionId}`,
      dispose,
      url: `http://127.0.0.1/mcp/${command.sessionId}`
    }
  }

  initialize(index: number): void {
    const callback = this.registrations[index]?.command.onInitialized
    expect(callback).toBeTypeOf('function')
    callback?.()
  }

  dispose(): void {}
}

class RecordingRepository implements AgentSessionRepository {
  readonly save = vi.fn(async () => {
    if (this.saveError) throw this.saveError
  })

  constructor(private readonly saveError?: Error) {}

  find(): Promise<AgentSession | null> {
    return Promise.resolve(null)
  }

  findAgent(): Promise<AgentSession | null> {
    return Promise.resolve(null)
  }

  findWorkspace(): Promise<readonly AgentSession[]> {
    return Promise.resolve([])
  }

  delete(): Promise<void> {
    return Promise.resolve()
  }

  deleteAgent(): Promise<void> {
    return Promise.resolve()
  }

  deleteProject(): Promise<void> {
    return Promise.resolve()
  }
}

function createHarness(
  input: {
    readonly registrationError?: Error
    readonly saveError?: Error
    readonly terminal?: RecordingAgentTerminalRuntime
  } = {}
) {
  const providers = new DesiredProviderRegistry()
  const mcp = new RecordingMcpRegistrations(input.registrationError)
  const repository = new RecordingRepository(input.saveError)
  const terminal = input.terminal ?? new RecordingAgentTerminalRuntime()
  const service = new AgentSessionService(
    terminal,
    mcp,
    { cancel: vi.fn(), execute: vi.fn(async () => completedToolResult()) },
    repository,
    providers.registry,
    'codex'
  )
  return { mcp, providers, repository, service, terminal }
}

class DeferredStartedAgentTerminalRuntime extends RecordingAgentTerminalRuntime {
  override launch(command: Parameters<RecordingAgentTerminalRuntime['launch']>[0]) {
    this.launches.push(command)
    return { generation: 1, launchId: 'launch-1' }
  }

  start(): void {
    this.launches[0]?.onStarted?.({ generation: 1, launchId: 'launch-1' })
  }
}

function attachCommand() {
  return {
    agentId: 'agent-1',
    onGraphUpdated: vi.fn(),
    onRuntimeChanged: vi.fn(),
    onToolApprovalRequested: vi.fn(),
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    providerId: 'codex',
    terminalSourceTheme: 'light' as const,
    workspaceDirectory: '/repo/app',
    workspaceId: 'main'
  }
}

function completedToolResult(): AgentToolExecutionResult {
  return {
    graph: {
      blocks: [],
      id: 'graph-1',
      projectId: 'project-1',
      terminalGroups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      workspaceId: 'main'
    },
    graphChanged: false,
    output: { type: 'block_graph' },
    status: 'completed',
    toolCallId: 'tool-call-1'
  }
}
