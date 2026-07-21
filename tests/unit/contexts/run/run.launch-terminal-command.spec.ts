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
    const portStates: string[] = []

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
      onEndpointConfirmed: (_session, endpoint) => confirmedEndpoints.push(endpoint.port),
      onPortStateChanged: (_session, _endpoint, state) => portStates.push(state)
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
    expect(portStates).toEqual(['releasing', 'released'])
  })

  it('reports a non-managed command as ended only after forwarding its process exit', async () => {
    const exitOrder: string[] = []
    let startCommand: Record<string, unknown> | null = null
    const session = createSession()
    const plans: TerminalLaunchPlanPort = {
      getPlan: async () => ({
        blockId: 'api',
        launchCommand: 'pnpm test',
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null }
      })
    }
    const sessions = {
      start: async (command: Record<string, unknown>) => {
        startCommand = command
        const event = { scope: session, sessionId: session.id, exitCode: 0 }
        ;(
          command.onExit as (exitEvent: {
            readonly scope: typeof session
            readonly sessionId: string
            readonly exitCode: number
          }) => void
        )(event)
        return session
      }
    } as unknown as TerminalSessionService
    const useCase = new LaunchTerminalCommandUseCase(
      plans,
      sessions,
      new RecordingManagedLauncher() as unknown as ManagedServiceLauncher
    )

    await useCase.execute({
      projectId: 'project-1',
      projectDirectory: '/project',
      workspaceName: 'main',
      workspaceDirectory: '/project',
      gitBranch: 'main',
      blockId: 'api',
      workingDirectory: '/project',
      signal: new AbortController().signal,
      onOutput: () => undefined,
      onExit: () => exitOrder.push('process-exit'),
      onRunEnded: () => exitOrder.push('run-ended'),
      onSessionStarted: () => undefined
    })

    expect(exitOrder).toEqual(['process-exit', 'run-ended'])
    expect(startCommand).toMatchObject({ launchMode: 'interactive' })
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
    const onPortStateChanged = command.onPortStateChanged as (
      startedSession: typeof session,
      actualEndpoint: ReturnType<typeof endpoint>,
      state: 'releasing' | 'released'
    ) => void
    onPortStateChanged(session, endpoint(), 'releasing')
    onPortStateChanged(session, endpoint(), 'released')
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

function createSession() {
  return {
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
