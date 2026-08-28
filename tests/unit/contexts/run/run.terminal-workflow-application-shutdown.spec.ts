import type { TerminalSessionSnapshot } from '../../../../src/contexts/run/application/dto/TerminalSessionSnapshot'
import type { WorkflowRunPlanSnapshot } from '../../../../src/contexts/run/application/dto/WorkflowRunSnapshot'
import type { TcpReadinessPort } from '../../../../src/contexts/run/application/ports/TcpReadinessPort'
import type { TerminalWorkflowEventPublisherPort } from '../../../../src/contexts/run/application/ports/TerminalWorkflowEventPublisherPort'
import type {
  StartWorkflowRuntimeCommand,
  TerminalWorkflowRuntimePort
} from '../../../../src/contexts/run/application/ports/TerminalWorkflowRuntimePort'
import type { TerminalWorkflowPlanPort } from '../../../../src/contexts/run/application/ports/TerminalWorkflowPlanPort'
import type {
  LaunchManagedServiceCommand,
  ManagedServiceRunSnapshot
} from '../../../../src/contexts/run/application/services/ManagedServiceLauncher'
import type { ManagedServiceLauncher } from '../../../../src/contexts/run/application/services/ManagedServiceLauncher'
import { TerminalWorkflowService } from '../../../../src/contexts/run/application/use-cases/TerminalWorkflowService'

describe('terminal workflow application shutdown', () => {
  it('stops scheduling and releases local workflow references without stopping PTYs', async () => {
    vi.useFakeTimers()
    const runtime = new GatedWorkflowRuntime()
    const service = createService(runtime, timeoutPlan())
    await service.start(startCommand())

    await service.prepareApplicationShutdown()
    await service.prepareApplicationShutdown()
    await vi.advanceTimersByTimeAsync(1_000)

    expect(runtime.stops).toEqual([])
    expect(service.getRuns(workflowScope())).toHaveLength(1)

    await service.completeApplicationShutdown()
    await service.completeApplicationShutdown()

    expect(service.getRuns(workflowScope())).toEqual([])
    expect(runtime.stops).toEqual([])
    await expect(service.start(startCommand())).rejects.toMatchObject({
      code: 'RUN_START_BLOCKED'
    })
    vi.useRealTimers()
  })

  it('does not issue a stale per-session stop when an admitted node start finishes during shutdown', async () => {
    const startGate = createDeferred<void>()
    const runtime = new GatedWorkflowRuntime(startGate.promise)
    const service = createService(runtime, singleTaskPlan())
    const starting = service.start(startCommand())
    await vi.waitFor(() => expect(runtime.commandStarts).toHaveLength(1))

    const preparing = service.prepareApplicationShutdown()
    const completion = service.completeApplicationShutdown()
    await Promise.resolve()
    expect(service.getRuns(workflowScope())).toHaveLength(1)

    startGate.resolve()
    await Promise.all([starting, preparing, completion, service.completeApplicationShutdown()])

    expect(runtime.stops).toEqual([])
    expect(service.getRuns(workflowScope())).toEqual([])
  })

  it('keeps explicit stopAll as the PTY-owning hard-dispose path', async () => {
    const runtime = new GatedWorkflowRuntime()
    const service = createService(runtime, singleTaskPlan())
    await service.start(startCommand())

    await service.stopAll()

    expect(runtime.stops).toEqual(['task-session'])
    expect(service.getRuns(workflowScope())).toEqual([])
  })

  it('arms managed-service Provider handoff before aborting workflow readiness', async () => {
    const runtime = new GatedWorkflowRuntime()
    const managedServices = new HandoffAwareManagedServices()
    const service = createService(
      runtime,
      managedServicePlan(),
      managedServices as unknown as ManagedServiceLauncher
    )
    const starting = service.start(startCommand())
    await vi.waitFor(() => expect(managedServices.launches).toHaveLength(1))

    await service.prepareApplicationShutdown()
    await starting

    expect(managedServices.abortedAfterHandoff).toBe(true)
    expect(managedServices.prepareCalls).toBe(1)
    expect(managedServices.completeCalls).toBe(0)

    await service.completeApplicationShutdown()

    expect(managedServices.completeCalls).toBe(1)
  })
})

class GatedWorkflowRuntime implements TerminalWorkflowRuntimePort {
  readonly commandStarts: StartWorkflowRuntimeCommand[] = []
  readonly stops: string[] = []

  constructor(private readonly startGate: Promise<void> = Promise.resolve()) {}

  async startCommand(command: StartWorkflowRuntimeCommand): Promise<TerminalSessionSnapshot> {
    this.commandStarts.push(command)
    await this.startGate
    return session(`${command.blockId}-session`, command.blockId)
  }

  stop(sessionId: string): Promise<void> {
    this.stops.push(sessionId)
    return Promise.resolve()
  }

  stopPreservingHistory(): Promise<null> {
    return Promise.resolve(null)
  }
}

class StaticPlanPort implements TerminalWorkflowPlanPort {
  constructor(private readonly plan: WorkflowRunPlanSnapshot) {}

  buildPlan(): Promise<WorkflowRunPlanSnapshot> {
    return Promise.resolve(this.plan)
  }
}

class NoopReadinessPort implements TcpReadinessPort {
  waitUntilClosed(): Promise<void> {
    return Promise.resolve()
  }

  waitUntilReady(): Promise<void> {
    return Promise.resolve()
  }
}

function createService(
  runtime: TerminalWorkflowRuntimePort,
  plan: WorkflowRunPlanSnapshot,
  managedServices?: ManagedServiceLauncher
): TerminalWorkflowService {
  return new TerminalWorkflowService(
    new StaticPlanPort(plan),
    runtime,
    new NoopReadinessPort(),
    {
      publish: vi.fn()
    } satisfies TerminalWorkflowEventPublisherPort,
    managedServices
  )
}

function startCommand() {
  return {
    gitBranch: 'main',
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    scope: { type: 'full' as const },
    workspaceDirectory: '/repo/app',
    workspaceId: 'main',
    workingDirectory: '/repo/app'
  }
}

function workflowScope() {
  return { projectDirectory: '/repo/app', workspaceId: 'main' }
}

function singleTaskPlan(): WorkflowRunPlanSnapshot {
  return {
    graphId: 'graph-1',
    nodes: [task('task')],
    workspaceId: 'main'
  }
}

function timeoutPlan(): WorkflowRunPlanSnapshot {
  return {
    graphId: 'graph-1',
    nodes: [
      {
        ...task('slow'),
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: 1_000 }
      }
    ],
    workspaceId: 'main'
  }
}

function managedServicePlan(): WorkflowRunPlanSnapshot {
  return {
    graphId: 'graph-1',
    nodes: [
      {
        blockId: 'service',
        dependencyBlockIds: [],
        executionConfig: {
          mode: 'service',
          port: {
            binding: { type: 'environment', variableName: 'PORT' },
            policy: { type: 'preferred', port: 3_000 },
            protocol: 'http'
          },
          readiness: { type: 'tcp' },
          readinessTimeoutMs: 30_000
        },
        launchCommand: 'pnpm dev',
        name: 'service'
      }
    ],
    workspaceId: 'main'
  }
}

function task(blockId: string): WorkflowRunPlanSnapshot['nodes'][number] {
  return {
    blockId,
    dependencyBlockIds: [],
    executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null },
    launchCommand: `run ${blockId}`,
    name: blockId
  }
}

function session(id: string, terminalBlockId: string): TerminalSessionSnapshot {
  return {
    blockId: terminalBlockId,
    exitCode: null,
    failureReason: null,
    generation: 1,
    gitBranch: 'main',
    id,
    inputHistory: [],
    kind: 'workflow',
    processId: 1,
    projectDirectory: '/repo/app',
    projectId: 'project-1',
    runId: 'run-1',
    recoveryKind: 'fresh',
    retentionPolicy: 'terminate-on-application-exit',
    sessionId: id,
    status: 'running',
    terminalBlockId,
    terminalSourceTheme: 'light',
    workspaceDirectory: '/repo/app',
    workspaceId: 'main',
    workingDirectory: '/repo/app'
  }
}

function createDeferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

class HandoffAwareManagedServices {
  readonly launches: LaunchManagedServiceCommand[] = []
  abortedAfterHandoff = false
  completeCalls = 0
  prepareCalls = 0
  private handoffArmed = false

  launch(command: LaunchManagedServiceCommand): Promise<ManagedServiceRunSnapshot> {
    this.launches.push(command)
    return new Promise((_, reject) => {
      command.signal.addEventListener(
        'abort',
        () => {
          this.abortedAfterHandoff = this.handoffArmed
          reject(command.signal.reason)
        },
        { once: true }
      )
    })
  }

  prepareApplicationShutdown(): Promise<void> {
    this.prepareCalls += 1
    this.handoffArmed = true
    return Promise.resolve()
  }

  completeApplicationShutdown(): Promise<void> {
    this.completeCalls += 1
    return Promise.resolve()
  }
}
