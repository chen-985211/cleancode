import { LaunchTerminalCommandUseCase } from '../../../../src/contexts/run/application/use-cases/LaunchTerminalCommandUseCase'
import type { TerminalLaunchPlanPort } from '../../../../src/contexts/run/application/ports/TerminalLaunchPlanPort'
import type { ManagedServiceLauncher } from '../../../../src/contexts/run/application/services/ManagedServiceLauncher'
import type { TerminalSessionService } from '../../../../src/contexts/run/application/use-cases/TerminalSessionService'

describe('launch terminal command', () => {
  it('uses the shared managed service launcher for a direct port service', async () => {
    const plans = new StaticLaunchPlanPort()
    const managed = new RecordingManagedLauncher()
    const sessions = { start: async () => neverCalled() } as unknown as TerminalSessionService
    const useCase = new LaunchTerminalCommandUseCase(
      plans,
      sessions,
      managed as unknown as ManagedServiceLauncher
    )
    const startedEndpoints: Array<number | null> = []
    const confirmedEndpoints: number[] = []

    const result = await useCase.execute({
      projectId: 'project-1',
      projectDirectory: '/project',
      workspaceName: 'main',
      workspaceDirectory: '/project',
      gitBranch: 'main',
      blockId: 'api',
      workingDirectory: '/project',
      signal: new AbortController().signal,
      onOutput: () => undefined,
      onExit: () => undefined,
      onSessionStarted: (_session, endpoint) => startedEndpoints.push(endpoint?.port ?? null),
      onEndpointConfirmed: (_session, endpoint) => confirmedEndpoints.push(endpoint.port)
    })

    expect(plans.queries).toEqual([
      {
        projectId: 'project-1',
        projectDirectory: '/project',
        workspaceName: 'main',
        blockId: 'api'
      }
    ])
    expect(managed.commands[0]).toMatchObject({
      projectId: 'project-1',
      workspaceDirectory: '/project',
      gitBranch: 'main',
      blockId: 'api',
      portIntent: { policy: { type: 'preferred', port: 3_000 } }
    })
    expect(result.endpoint).toMatchObject({ port: 41_001 })
    expect(startedEndpoints).toEqual([null])
    expect(confirmedEndpoints).toEqual([41_001])
  })
})

class StaticLaunchPlanPort implements TerminalLaunchPlanPort {
  readonly queries: Parameters<TerminalLaunchPlanPort['getPlan']>[0][] = []

  async getPlan(query: Parameters<TerminalLaunchPlanPort['getPlan']>[0]) {
    this.queries.push(query)
    return {
      blockId: 'api',
      launchCommand: 'pnpm dev',
      executionConfig: {
        mode: 'service' as const,
        readiness: { type: 'tcp' as const },
        readinessTimeoutMs: 30_000,
        port: {
          protocol: 'http' as const,
          policy: { type: 'preferred' as const, port: 3_000 },
          binding: { type: 'environment' as const, variableName: 'PORT' }
        }
      }
    }
  }
}

class RecordingManagedLauncher {
  readonly commands: Array<Record<string, unknown>> = []

  async launch(command: Record<string, unknown>) {
    this.commands.push(command)
    const session = {
      projectId: 'project-1',
      projectDirectory: '/project',
      workspaceName: 'main',
      workspaceDirectory: '/project',
      gitBranch: 'main',
      blockId: 'api',
      sessionId: 'session-1',
      runId: 'run-1',
      generation: 1,
      id: 'session-1',
      terminalBlockId: 'api',
      workingDirectory: '/project',
      processId: 1,
      status: 'running' as const,
      inputHistory: [],
      exitCode: null,
      failureReason: null
    }
    const onSessionStarted = command.onSessionStarted as (startedSession: typeof session) => void
    const onEndpointConfirmed = command.onEndpointConfirmed as (
      startedSession: typeof session,
      actualEndpoint: ReturnType<typeof endpoint>
    ) => void
    onSessionStarted(session)
    onEndpointConfirmed(session, endpoint())
    return {
      scope: session,
      session,
      endpoint: endpoint(),
      lease: {
        id: 'lease-1',
        owner: session,
        endpoint: endpoint(),
        state: 'bound',
        quarantineReason: null
      }
    }
  }
}

function endpoint() {
  return {
    protocol: 'http' as const,
    host: '127.0.0.1' as const,
    port: 41_001,
    requestedPort: 3_000,
    fallback: true,
    displayAddress: 'http://127.0.0.1:41001',
    openable: true
  }
}

function neverCalled(): never {
  throw new Error('TerminalSessionService.start should not be called for a managed port service.')
}
