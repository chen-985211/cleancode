import { vi } from 'vitest'

import { createExpectedAppError } from '../../../../src/shared-kernel/application/errors/AppError'
import { TerminalWorkflowService } from '../../../../src/contexts/run/application/use-cases/TerminalWorkflowService'
import type { TerminalWorkflowPlanPort } from '../../../../src/contexts/run/application/ports/TerminalWorkflowPlanPort'
import type {
  StartWorkflowRuntimeCommand,
  TerminalWorkflowRuntimePort
} from '../../../../src/contexts/run/application/ports/TerminalWorkflowRuntimePort'
import type { TcpReadinessPort } from '../../../../src/contexts/run/application/ports/TcpReadinessPort'
import type {
  TerminalWorkflowEvent,
  TerminalWorkflowEventPublisherPort
} from '../../../../src/contexts/run/application/ports/TerminalWorkflowEventPublisherPort'
import type { TerminalSessionSnapshot } from '../../../../src/contexts/run/application/dto/TerminalSessionSnapshot'
import type { WorkflowRunPlanSnapshot } from '../../../../src/contexts/run/application/dto/WorkflowRunSnapshot'
import type { ManagedServiceLauncher } from '../../../../src/contexts/run/application/services/ManagedServiceLauncher'
import { RunLifecycleService } from '../../../../src/contexts/run/application/use-cases/RunLifecycleService'

describe('terminal workflow service', () => {
  it('starts roots in parallel, schedules fan-in once, and hands completed tasks to interactive shells', async () => {
    const runtime = new FakeRuntime()
    const service = createService(createTaskPlan(), runtime)

    await service.start(createStartCommand())
    expect(runtime.commandStarts.map((start) => start.blockId)).toEqual(['install-a', 'install-b'])

    runtime.exit('install-a', 0)
    await vi.waitFor(() => expect(runtime.interactiveStarts).toEqual(['install-a']))
    expect(runtime.commandStarts.map((start) => start.blockId)).not.toContain('build')

    runtime.exit('install-b', 0)
    await vi.waitFor(() =>
      expect(runtime.commandStarts.map((start) => start.blockId)).toContain('build')
    )
    runtime.exit('build', 0)

    await vi.waitFor(() =>
      expect(service.getActiveRun(createWorkflowScope())?.status).toBe('succeeded')
    )
    expect(runtime.interactiveStarts).toEqual(['install-a', 'install-b', 'build'])
  })

  it('matches literal output across chunks and releases service dependents when ready', async () => {
    const runtime = new FakeRuntime()
    const service = createService(createOutputServicePlan(), runtime)

    await service.start(createStartCommand())
    runtime.output('api', 'server re')
    runtime.output('api', 'ady on 3000')

    await vi.waitFor(() =>
      expect(runtime.commandStarts.map((start) => start.blockId)).toContain('browser')
    )
    expect(service.getActiveRun(createWorkflowScope())?.nodes[0]?.status).toBe('ready')
  })

  it('fails timed-out tasks, blocks descendants, and lets independent branches finish', async () => {
    vi.useFakeTimers()
    const runtime = new FakeRuntime()
    const service = createService(createTimeoutPlan(), runtime)

    await service.start(createStartCommand())
    await vi.advanceTimersByTimeAsync(1_000)

    expect(runtime.stops).toEqual(['slow-session'])
    expect(service.getActiveRun(createWorkflowScope())).toMatchObject({
      nodes: [
        { blockId: 'slow', status: 'failed' },
        { blockId: 'after-slow', status: 'blocked' },
        { blockId: 'independent', status: 'running' }
      ]
    })

    runtime.exit('independent', 0)
    await vi.runAllTimersAsync()
    expect(service.getActiveRun(createWorkflowScope())?.status).toBe('failed')
    vi.useRealTimers()
  })

  it('keeps workflows with the same workspace name isolated by project', async () => {
    const runtime = new FakeRuntime()
    const service = new TerminalWorkflowService(
      new ProjectScopedPlanPort(),
      runtime,
      new FakeTcpReadiness(),
      new RecordingPublisher()
    )

    await service.start(createStartCommand('/first-project'))
    await service.start(createStartCommand('/second-project'))

    expect(runtime.stops).toEqual([])
    expect(service.getActiveRun(createWorkflowScope('/first-project'))?.graphId).toBe(
      'graph-first-project'
    )
    expect(service.getActiveRun(createWorkflowScope('/second-project'))?.graphId).toBe(
      'graph-second-project'
    )

    await service.stop(createWorkflowScope('/first-project'))

    expect(runtime.stops).toEqual(['first-project-task-session'])
    expect(service.getActiveRun(createWorkflowScope('/second-project'))?.status).toBe('running')
  })

  it('uses the shared managed launcher for port services and publishes the actual endpoint', async () => {
    const runtime = new FakeRuntime()
    const publisher = new RecordingPublisher()
    const managed = new FakeManagedServiceLauncher()
    const service = new TerminalWorkflowService(
      new FakePlanPort(createManagedServicePlan()),
      runtime,
      new FakeTcpReadiness(),
      publisher,
      managed as unknown as ManagedServiceLauncher
    )

    await service.start(createStartCommand())

    expect(managed.launches).toHaveLength(1)
    expect(managed.launches[0]).toMatchObject({
      projectId: 'project-project',
      blockId: 'api',
      portIntent: { policy: { type: 'preferred', port: 3_000 } }
    })
    expect(runtime.commandStarts.map((start) => start.blockId)).toContain('browser')
    expect(publisher.events).toContainEqual(
      expect.objectContaining({
        type: 'service-endpoint-updated',
        endpoint: expect.objectContaining({ port: 41_001 })
      })
    )
    const serviceEvents = publisher.events.filter(
      (event) =>
        (event.type === 'terminal-session-started' && event.blockId === 'api') ||
        event.type === 'service-endpoint-updated'
    )
    expect(serviceEvents).toEqual([
      expect.objectContaining({ type: 'terminal-session-started', endpoint: null }),
      expect.objectContaining({
        type: 'service-endpoint-updated',
        endpoint: expect.objectContaining({ port: 41_001 })
      })
    ])
    expect(service.getActiveRun(createWorkflowScope())?.nodes[0]).toMatchObject({
      status: 'ready',
      endpoint: { port: 41_001 },
      error: null
    })
  })

  it('publishes a raw structured port conflict event for workflow launch failures', async () => {
    const publisher = new RecordingPublisher()
    const managed = new FakeManagedServiceLauncher(
      createExpectedAppError('SERVICE_PORT_FIXED_CONFLICT', 'Port 3000 is occupied.', {
        port: 3_000,
        attemptedProjectId: 'project-project',
        attemptedBlockId: 'api',
        attemptedSessionId: 'session-attempt',
        attemptedRunId: 'run-attempt',
        attemptedGeneration: 1
      })
    )
    const service = new TerminalWorkflowService(
      new FakePlanPort(createManagedServicePlan()),
      new FakeRuntime(),
      new FakeTcpReadiness(),
      publisher,
      managed as unknown as ManagedServiceLauncher
    )

    await service.start(createStartCommand())

    expect(publisher.events).toContainEqual({
      type: 'service-port-conflict',
      failure: {
        code: 'SERVICE_PORT_FIXED_CONFLICT',
        message: 'Port 3000 is occupied.',
        details: expect.objectContaining({
          port: 3_000,
          attemptedBlockId: 'api',
          attemptedRunId: 'run-attempt'
        })
      }
    })
  })

  it('hard-disposes the whole workflow without handoff or late timeout scheduling', async () => {
    vi.useFakeTimers()
    const runtime = new FakeRuntime()
    const publisher = new RecordingPublisher()
    const lifecycle = new RunLifecycleService()
    const service = new TerminalWorkflowService(
      new FakePlanPort(createTimeoutPlan()),
      runtime,
      new FakeTcpReadiness(),
      publisher,
      undefined,
      lifecycle
    )

    await service.start(createStartCommand())
    const lease = await lifecycle.hardDisposeWorkspace({
      projectDirectory: '/project',
      workspaceName: 'main'
    })

    expect(runtime.stops).toEqual(expect.arrayContaining(['slow-session', 'independent-session']))
    expect(runtime.interactiveStarts).toEqual([])
    expect(service.getActiveRun(createWorkflowScope())).toBeNull()
    const eventCount = publisher.events.length

    await vi.advanceTimersByTimeAsync(1_000)
    runtime.exit('slow', 1)
    await Promise.resolve()
    expect(runtime.commandStarts.map((start) => start.blockId)).not.toContain('after-slow')
    expect(runtime.interactiveStarts).toEqual([])
    expect(publisher.events).toHaveLength(eventCount)
    lease.release()
    vi.useRealTimers()
  })

  it('waits for an in-flight node start to be stopped before hard dispose completes', async () => {
    let releaseStart: () => void = () => undefined
    const startGate = new Promise<void>((resolve) => {
      releaseStart = resolve
    })
    const runtime = new FakeRuntime(startGate)
    const lifecycle = new RunLifecycleService()
    const service = new TerminalWorkflowService(
      new FakePlanPort(plan([task('api')])),
      runtime,
      new FakeTcpReadiness(),
      new RecordingPublisher(),
      undefined,
      lifecycle
    )
    const starting = service.start(createStartCommand())
    await vi.waitFor(() => expect(runtime.commandStarts).toHaveLength(1))

    let disposed = false
    const disposing = lifecycle
      .hardDisposeWorkspace({ projectDirectory: '/project', workspaceName: 'main' })
      .then((lease) => {
        disposed = true
        return lease
      })
    await Promise.resolve()
    expect(disposed).toBe(false)

    releaseStart()
    const lease = await disposing
    await Promise.allSettled([starting])
    expect(runtime.stops).toEqual(['api-session'])
    expect(service.getActiveRun(createWorkflowScope())).toBeNull()
    lease.release()
  })
})

class FakeRuntime implements TerminalWorkflowRuntimePort {
  readonly commandStarts: StartWorkflowRuntimeCommand[] = []
  readonly interactiveStarts: string[] = []
  readonly stops: string[] = []
  private readonly commands = new Map<string, StartWorkflowRuntimeCommand>()

  constructor(private readonly commandStartGate?: Promise<void>) {}

  async startCommand(command: StartWorkflowRuntimeCommand): Promise<TerminalSessionSnapshot> {
    this.commandStarts.push(command)
    this.commands.set(command.blockId, command)
    await this.commandStartGate
    return session(`${command.blockId}-session`, command.blockId)
  }

  async startInteractive(command: StartWorkflowRuntimeCommand): Promise<TerminalSessionSnapshot> {
    this.interactiveStarts.push(command.blockId)
    return session(`${command.blockId}-interactive`, command.blockId)
  }

  async stop(sessionId: string): Promise<void> {
    this.stops.push(sessionId)
  }

  output(blockId: string, data: string): void {
    const runtimeSession = session(`${blockId}-session`, blockId)
    this.commands.get(blockId)?.onOutput({
      scope: runtimeSession,
      sessionId: runtimeSession.id,
      sequence: 1,
      data
    })
  }

  exit(blockId: string, exitCode: number): void {
    const runtimeSession = session(`${blockId}-session`, blockId)
    this.commands.get(blockId)?.onExit({
      scope: runtimeSession,
      sessionId: runtimeSession.id,
      exitCode
    })
  }
}

class FakePlanPort implements TerminalWorkflowPlanPort {
  constructor(private readonly plan: WorkflowRunPlanSnapshot) {}

  async buildPlan(): Promise<WorkflowRunPlanSnapshot> {
    return this.plan
  }
}

class ProjectScopedPlanPort implements TerminalWorkflowPlanPort {
  async buildPlan(command: {
    readonly projectDirectory: string
  }): Promise<WorkflowRunPlanSnapshot> {
    const projectName = command.projectDirectory.slice(1)
    return {
      graphId: `graph-${projectName}`,
      workspaceName: 'main',
      nodes: [task(`${projectName}-task`)]
    }
  }
}

class FakeTcpReadiness implements TcpReadinessPort {
  async waitUntilReady(): Promise<void> {}
  async waitUntilClosed(): Promise<void> {}
}

class RecordingPublisher implements TerminalWorkflowEventPublisherPort {
  readonly events: TerminalWorkflowEvent[] = []

  publish(event: TerminalWorkflowEvent): void {
    this.events.push(event)
  }
}

function createService(
  plan: WorkflowRunPlanSnapshot,
  runtime: TerminalWorkflowRuntimePort
): TerminalWorkflowService {
  return new TerminalWorkflowService(
    new FakePlanPort(plan),
    runtime,
    new FakeTcpReadiness(),
    new RecordingPublisher()
  )
}

function createStartCommand(projectDirectory = '/project') {
  return {
    projectId: `project-${projectDirectory.slice(1)}`,
    projectDirectory,
    workspaceName: 'main',
    workspaceDirectory: projectDirectory,
    gitBranch: 'main',
    workingDirectory: projectDirectory,
    scope: { type: 'full' as const }
  }
}

function createManagedServicePlan(): WorkflowRunPlanSnapshot {
  return plan([
    {
      ...task('api'),
      executionConfig: {
        mode: 'service',
        readiness: { type: 'tcp' },
        readinessTimeoutMs: 30_000,
        port: {
          protocol: 'http',
          policy: { type: 'preferred', port: 3_000 },
          binding: { type: 'environment', variableName: 'PORT' }
        }
      }
    },
    task('browser', ['api'])
  ])
}

function createWorkflowScope(projectDirectory = '/project') {
  return { projectDirectory, workspaceName: 'main' }
}

function createTaskPlan(): WorkflowRunPlanSnapshot {
  return plan([task('install-a'), task('install-b'), task('build', ['install-a', 'install-b'])])
}

function createOutputServicePlan(): WorkflowRunPlanSnapshot {
  return plan([
    {
      ...task('api'),
      executionConfig: {
        mode: 'service',
        readiness: { type: 'output', text: 'server ready' },
        readinessTimeoutMs: 30_000
      }
    },
    task('browser', ['api'])
  ])
}

function createTimeoutPlan(): WorkflowRunPlanSnapshot {
  return plan([
    { ...task('slow'), executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: 1_000 } },
    task('after-slow', ['slow']),
    task('independent')
  ])
}

function plan(nodes: WorkflowRunPlanSnapshot['nodes']): WorkflowRunPlanSnapshot {
  return { graphId: 'graph-1', workspaceName: 'main', nodes }
}

function task(blockId: string, dependencyBlockIds: readonly string[] = []) {
  return {
    blockId,
    name: blockId,
    launchCommand: `run ${blockId}`,
    dependencyBlockIds,
    executionConfig: { mode: 'task' as const, successExitCodes: [0], timeoutMs: null }
  }
}

function session(id: string, terminalBlockId: string): TerminalSessionSnapshot {
  return {
    projectId: 'project-project',
    projectDirectory: '/project',
    workspaceDirectory: '/project',
    gitBranch: 'main',
    blockId: terminalBlockId,
    sessionId: id,
    runId: 'run-1',
    generation: 1,
    id,
    terminalBlockId,
    workspaceName: 'main',
    workingDirectory: '/project',
    processId: 1,
    status: 'running',
    kind: 'workflow',
    retentionPolicy: 'terminate-on-application-exit',
    recoveryKind: 'fresh',
    inputHistory: [],
    exitCode: null,
    failureReason: null
  }
}

class FakeManagedServiceLauncher {
  readonly launches: Array<Record<string, unknown>> = []

  constructor(private readonly launchError?: Error) {}

  async launch(command: Record<string, unknown>) {
    this.launches.push(command)
    if (this.launchError) throw this.launchError
    const started = command.onSessionStarted as (session: TerminalSessionSnapshot) => void
    const confirmed = command.onEndpointConfirmed as (
      session: TerminalSessionSnapshot,
      actualEndpoint: ReturnType<typeof endpoint>
    ) => void
    const terminalSession = session('api-managed', 'api')
    started(terminalSession)
    confirmed(terminalSession, endpoint())
    return {
      scope: terminalSession,
      session: terminalSession,
      endpoint: endpoint(),
      lease: {
        id: 'lease-1',
        owner: terminalSession,
        endpoint: endpoint(),
        state: 'bound',
        quarantineReason: null
      }
    }
  }

  getActive(): null {
    return null
  }

  async stop(): Promise<void> {}
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
