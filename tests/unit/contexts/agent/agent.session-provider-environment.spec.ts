import type {
  AgentProviderAvailability,
  AgentProviderContribution
} from '../../../../src/contexts/agent/application/ports/AgentProviderContribution'
import type { AgentProviderDetectionEnvironmentPort } from '../../../../src/contexts/agent/application/ports/AgentProviderDetectionEnvironmentPort'
import type { AgentMcpServerPort } from '../../../../src/contexts/agent/application/ports/AgentMcpServerPort'
import type { AgentSessionRepository } from '../../../../src/contexts/agent/application/ports/AgentSessionRepository'
import { allowAgentRuntimeScope } from '../../../../src/contexts/agent/application/ports/AgentRuntimeScopeValidationPort'
import { AgentProviderAvailabilityService } from '../../../../src/contexts/agent/application/services/AgentProviderAvailabilityService'
import { AgentProviderRegistry } from '../../../../src/contexts/agent/application/services/AgentProviderRegistry'
import { AgentSessionService } from '../../../../src/contexts/agent/application/use-cases/AgentSessionService'
import { validateAgentProviderAvailability } from '../../../../src/contexts/agent/application/use-cases/AgentSessionRuntimeState'
import { AgentSession } from '../../../../src/contexts/agent/domain/aggregates/AgentSession'
import { AgentProviderPreferences } from '../../../../src/contexts/agent/domain/aggregates/AgentProviderPreferences'
import { RecordingAgentTerminalRuntime } from '../../../fixtures/agentTerminalRuntime'

describe('Agent session Provider environment', () => {
  it('prepares the shared detection environment before validating an existing Agent launch', async () => {
    const preparation = createDeferred<void>()
    const environment: AgentProviderDetectionEnvironmentPort = {
      prepare: vi.fn(() => preparation.promise)
    }
    const contribution = createContribution('codex')
    const availability = new AgentProviderAvailabilityService(
      new AgentProviderRegistry([contribution]),
      environment
    )

    const validation = validateAgentProviderAvailability(contribution, availability)
    await flushPromises()

    expect(environment.prepare).toHaveBeenCalledWith({ refresh: true })
    expect(contribution.detector.inspect).not.toHaveBeenCalled()

    preparation.resolve()
    await validation
    expect(contribution.detector.inspect).toHaveBeenCalledOnce()
  })

  it('hydrates the Provider PATH before opening a restored Agent terminal', async () => {
    const preparation = createDeferred<void>()
    const events: string[] = []
    const environment: AgentProviderDetectionEnvironmentPort = {
      prepare: vi.fn(async () => {
        events.push('prepare')
        await preparation.promise
      })
    }
    const contribution = createContribution('codex')
    contribution.detector.inspect.mockImplementation(async () => {
      events.push('inspect')
      return { providerId: 'codex', status: 'installed', version: 'test' }
    })
    const registry = new AgentProviderRegistry([contribution])
    const availability = new AgentProviderAvailabilityService(registry, environment)
    const terminal = new RecordingAgentTerminalRuntime()
    const openTerminal = terminal.open.bind(terminal)
    vi.spyOn(terminal, 'open').mockImplementation(async (command) => {
      events.push('open')
      return openTerminal(command)
    })
    const service = new AgentSessionService(
      terminal,
      noopMcpServer,
      unusedToolExecution,
      restoredAgentRepository,
      registry,
      'codex',
      allowAgentRuntimeScope,
      availability
    )

    const attachment = service.attach({
      agentId: 'agent-1',
      onGraphUpdated: vi.fn(),
      onRuntimeChanged: vi.fn(),
      onToolApprovalRequested: vi.fn(),
      projectDirectory: '/repo/app',
      projectId: 'project-1',
      terminalSourceTheme: 'light',
      workspaceDirectory: '/repo/app',
      workspaceName: 'main'
    })
    await vi.waitFor(() => expect(environment.prepare).toHaveBeenCalledOnce())

    expect(events).toEqual(['prepare'])
    expect(terminal.opens).toHaveLength(0)

    preparation.resolve()
    await attachment

    expect(events).toEqual(['prepare', 'inspect', 'open'])
    expect(environment.prepare).toHaveBeenCalledOnce()
    expect(contribution.detector.inspect).toHaveBeenCalledOnce()
  })

  it('resolves the persisted Yolo mode and launch overrides before creating a launch plan', async () => {
    const contribution = createContribution('codex', {
      defaultArguments: ['--base'],
      defaultEnvironment: { BASE: '1' },
      executable: 'codex',
      permission: {
        arguments: ['--yolo'],
        environment: { TRUSTED: '1' }
      }
    })
    const registry = new AgentProviderRegistry([contribution])
    const preferences = AgentProviderPreferences.create()
    preferences.setProviderOverride('codex', {
      argumentsText: '--profile "Clean Code"',
      environment: { BASE: '2', CUSTOM: 'yes' },
      executable: '/opt/bin/codex'
    })
    const service = new AgentSessionService(
      new RecordingAgentTerminalRuntime(),
      noopMcpServer,
      unusedToolExecution,
      restoredAgentRepository,
      registry,
      'codex',
      allowAgentRuntimeScope,
      new AgentProviderAvailabilityService(registry),
      {
        load: async () => preferences.toSnapshot(),
        save: async () => undefined
      }
    )

    await service.attach({
      agentId: 'agent-1',
      onGraphUpdated: vi.fn(),
      onRuntimeChanged: vi.fn(),
      onToolApprovalRequested: vi.fn(),
      projectDirectory: '/repo/app',
      projectId: 'project-1',
      terminalSourceTheme: 'light',
      workspaceDirectory: '/repo/app',
      workspaceName: 'main'
    })

    expect(contribution.launcher.createLaunchPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        launchProfile: {
          arguments: ['--base', '--yolo', '--profile', 'Clean Code'],
          environment: { BASE: '2', CUSTOM: 'yes', TRUSTED: '1' },
          executable: '/opt/bin/codex'
        }
      })
    )
  })
})

const restoredAgent = AgentSession.create({
  agentId: 'agent-1',
  layout: { position: { x: 120, y: 80 }, size: { height: 460, width: 720 } },
  name: 'Agent 1',
  projectId: 'project-1',
  providerId: 'codex',
  workspaceName: 'main'
})

const restoredAgentRepository: AgentSessionRepository = {
  delete: async () => undefined,
  deleteAgent: async () => undefined,
  deleteProject: async () => undefined,
  find: async () => null,
  findAgent: async () => restoredAgent,
  findWorkspace: async () => [restoredAgent],
  save: async () => undefined
}

const noopMcpServer: AgentMcpServerPort = {
  dispose: () => undefined,
  registerSession: async () => {
    throw new Error('MCP is unsupported in this fixture.')
  }
}

const unusedToolExecution = {
  cancel: async () => {
    throw new Error('Agent tools are not used in this fixture.')
  },
  execute: async () => {
    throw new Error('Agent tools are not used in this fixture.')
  }
}

function createContribution(
  id: string,
  launch?: NonNullable<AgentProviderContribution['descriptor']['launch']>
): AgentProviderContribution & {
  readonly detector: { readonly inspect: ReturnType<typeof vi.fn> }
  readonly launcher: { readonly createLaunchPlan: ReturnType<typeof vi.fn> }
} {
  return {
    descriptor: {
      capabilities: {
        activityTracking: false,
        cleancodeMcp: false,
        launchInstructions: false,
        resume: false,
        sessionIdentityCapture: false,
        sessionRefCodec: false
      },
      displayName: id,
      icon: {
        paths: [{ d: 'M2 2h20v20H2z' }],
        viewBox: '0 0 24 24'
      },
      id,
      ...(launch ? { launch } : {})
    },
    detector: {
      inspect: vi.fn(async (): Promise<AgentProviderAvailability> => ({
        providerId: id,
        status: 'installed',
        version: 'test'
      }))
    },
    launcher: {
      createLaunchPlan: vi.fn(async () => ({ args: [], env: {}, executable: id }))
    }
  }
}

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolvePromise: (value: T) => void = () => undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
