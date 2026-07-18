import { vi } from 'vitest'

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
})

class FakeRuntime implements TerminalWorkflowRuntimePort {
  readonly commandStarts: StartWorkflowRuntimeCommand[] = []
  readonly interactiveStarts: string[] = []
  readonly stops: string[] = []
  private readonly commands = new Map<string, StartWorkflowRuntimeCommand>()

  async startCommand(command: StartWorkflowRuntimeCommand): Promise<TerminalSessionSnapshot> {
    this.commandStarts.push(command)
    this.commands.set(command.blockId, command)
    return session(`${command.blockId}-session`, command.blockId)
  }

  async startInteractive(command: StartWorkflowRuntimeCommand): Promise<TerminalSessionSnapshot> {
    this.interactiveStarts.push(command.blockId)
    return session(`${command.blockId}-interactive`, command.blockId)
  }

  stop(sessionId: string): void {
    this.stops.push(sessionId)
  }

  output(blockId: string, data: string): void {
    this.commands.get(blockId)?.onOutput({ sessionId: `${blockId}-session`, data })
  }

  exit(blockId: string, exitCode: number): void {
    this.commands.get(blockId)?.onExit({ sessionId: `${blockId}-session`, exitCode })
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
    projectDirectory,
    workspaceName: 'main',
    workingDirectory: projectDirectory,
    scope: { type: 'full' as const }
  }
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
    id,
    terminalBlockId,
    workspaceName: 'main',
    workingDirectory: '/project',
    processId: 1,
    status: 'running',
    inputHistory: [],
    exitCode: null,
    failureReason: null
  }
}
