import type { TerminalSessionSnapshot } from '../../../../src/contexts/run/application/dto/TerminalSessionSnapshot'
import type { WorkflowRunPlanSnapshot } from '../../../../src/contexts/run/application/dto/WorkflowRunSnapshot'
import type { TerminalWorkflowPlanPort } from '../../../../src/contexts/run/application/ports/TerminalWorkflowPlanPort'
import type {
  StartWorkflowRuntimeCommand,
  TerminalWorkflowRuntimePort
} from '../../../../src/contexts/run/application/ports/TerminalWorkflowRuntimePort'
import type { TcpReadinessPort } from '../../../../src/contexts/run/application/ports/TcpReadinessPort'
import type { TerminalWorkflowEventPublisherPort } from '../../../../src/contexts/run/application/ports/TerminalWorkflowEventPublisherPort'
import { TerminalWorkflowService } from '../../../../src/contexts/run/application/use-cases/TerminalWorkflowService'
import { RunLifecycleService } from '../../../../src/contexts/run/application/use-cases/RunLifecycleService'

describe('terminal workflow concurrency', () => {
  it('keeps disjoint workflows in the same workspace running independently', async () => {
    const runtime = new RecordingRuntime()
    const service = new TerminalWorkflowService(
      new BlockSetPlanPort(),
      runtime,
      new ReadyTcpPort(),
      new SilentPublisher()
    )

    await service.start(startCommand('frontend'))
    await service.start(startCommand('backend'))

    expect(runtime.startedBlockIds).toEqual(['frontend', 'backend'])
    expect(runtime.historyPreservingStops).toEqual([])
    expect(runtime.hardStops).toEqual([])
  })

  it('queries workspace runs and stops only the requested run', async () => {
    const runtime = new RecordingRuntime()
    const service = createService(runtime)

    const frontend = await service.start(startCommand('frontend'))
    const backend = await service.start(startCommand('backend'))

    expect(service.getRuns(workflowScope()).map((run) => run.id)).toEqual([frontend.id, backend.id])

    await service.stop({ ...workflowScope(), runId: backend.id })

    expect(runtime.historyPreservingStops).toEqual([sessionId('backend', backend.id)])
    expect(service.getRuns(workflowScope())).toEqual([
      expect.objectContaining({ id: frontend.id, status: 'running' }),
      expect.objectContaining({ id: backend.id, status: 'stopped' })
    ])
  })

  it('rejects a new workflow whose nodes overlap an active run', async () => {
    const runtime = new RecordingRuntime()
    const service = createService(runtime)

    const existing = await service.start(startCommand('frontend'))

    await expect(service.start(startCommand('frontend'))).rejects.toMatchObject({
      code: 'TERMINAL_WORKFLOW_SCOPE_CONFLICT'
    })
    expect(runtime.startedBlockIds).toEqual(['frontend'])
    expect(runtime.hardStops).toEqual([])
    expect(service.getRuns(workflowScope())).toEqual([
      expect.objectContaining({ id: existing.id, status: 'running' })
    ])
  })

  it('serializes simultaneous starts that compete for the same terminal', async () => {
    const runtime = new RecordingRuntime()
    const service = createService(runtime, new RunLifecycleService())

    const results = await Promise.allSettled([
      service.start(startCommand('frontend')),
      service.start(startCommand('frontend'))
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toEqual([
      expect.objectContaining({
        reason: expect.objectContaining({ code: 'TERMINAL_WORKFLOW_SCOPE_CONFLICT' })
      })
    ])
    expect(runtime.startedBlockIds).toEqual(['frontend'])
  })

  it('replaces a terminal projection when the same workflow starts again', async () => {
    const runtime = new RecordingRuntime()
    const service = createService(runtime)

    const completed = await service.start(startCommand('frontend'))
    runtime.exit('frontend', 0)
    await vi.waitFor(() =>
      expect(service.getRuns(workflowScope())).toEqual([
        expect.objectContaining({ id: completed.id, status: 'succeeded' })
      ])
    )

    const restarted = await service.start(startCommand('frontend'))

    expect(service.getRuns(workflowScope())).toEqual([
      expect.objectContaining({ id: restarted.id, status: 'running' })
    ])
    expect(runtime.startedBlockIds).toEqual(['frontend', 'frontend'])
  })

  it('hard-disposes only the workflow that owns a deleted terminal', async () => {
    const runtime = new RecordingRuntime()
    const lifecycle = new RunLifecycleService()
    const service = createService(runtime, lifecycle)

    const frontend = await service.start(startCommand('frontend'))
    const backend = await service.start(startCommand('backend'))

    const lease = await lifecycle.hardDisposeTerminal({
      projectId: 'project-1',
      projectDirectory: '/project',
      workspaceId: 'main',
      blockId: 'frontend'
    })

    expect(runtime.hardStops).toEqual([sessionId('frontend', frontend.id)])
    expect(service.getRuns(workflowScope())).toEqual([
      expect.objectContaining({ id: backend.id, status: 'running' })
    ])
    lease.release()
  })
})

function createService(
  runtime: RecordingRuntime,
  lifecycle?: RunLifecycleService
): TerminalWorkflowService {
  return new TerminalWorkflowService(
    new BlockSetPlanPort(),
    runtime,
    new ReadyTcpPort(),
    new SilentPublisher(),
    undefined,
    lifecycle
  )
}

class BlockSetPlanPort implements TerminalWorkflowPlanPort {
  async buildPlan(query: {
    readonly workspaceId: string
    readonly scope: { readonly type: string; readonly blockIds?: readonly string[] }
  }): Promise<WorkflowRunPlanSnapshot> {
    const blockIds = query.scope.type === 'block-set' ? (query.scope.blockIds ?? []) : []
    return {
      graphId: 'graph-1',
      workspaceId: query.workspaceId,
      nodes: blockIds.map((blockId) => ({
        blockId,
        name: blockId,
        launchCommand: `run ${blockId}`,
        dependencyBlockIds: [],
        executionConfig: { mode: 'task', successExitCodes: [0], timeoutMs: null }
      }))
    }
  }
}

class RecordingRuntime implements TerminalWorkflowRuntimePort {
  readonly hardStops: string[] = []
  readonly historyPreservingStops: string[] = []
  readonly startedBlockIds: string[] = []
  private readonly commands = new Map<string, StartWorkflowRuntimeCommand>()

  async startCommand(command: StartWorkflowRuntimeCommand): Promise<TerminalSessionSnapshot> {
    this.startedBlockIds.push(command.blockId)
    this.commands.set(command.blockId, command)
    return workflowSession(command)
  }

  async stop(sessionId: string): Promise<void> {
    this.hardStops.push(sessionId)
  }

  async stopPreservingHistory(sessionId: string) {
    this.historyPreservingStops.push(sessionId)
    return null
  }

  exit(blockId: string, exitCode: number): void {
    const command = this.commands.get(blockId)
    if (!command) return
    const session = workflowSession(command)
    command.onExit({ scope: session, sessionId: session.id, exitCode })
  }
}

class ReadyTcpPort implements TcpReadinessPort {
  async waitUntilReady(): Promise<void> {}
  async waitUntilClosed(): Promise<void> {}
}

class SilentPublisher implements TerminalWorkflowEventPublisherPort {
  publish(): void {}
}

function startCommand(blockId: string) {
  return {
    projectId: 'project-1',
    projectDirectory: '/project',
    workspaceId: 'main',
    workspaceDirectory: '/project',
    gitBranch: 'main',
    workingDirectory: '/project',
    scope: { type: 'block-set' as const, blockIds: [blockId] }
  }
}

function workflowScope() {
  return { projectDirectory: '/project', workspaceId: 'main' }
}

function sessionId(blockId: string, runId: string): string {
  return `${blockId}-${runId}`
}

function workflowSession(command: StartWorkflowRuntimeCommand): TerminalSessionSnapshot {
  const workflowSessionId = sessionId(command.blockId, command.runId)
  return {
    projectId: command.projectId,
    projectDirectory: command.projectDirectory,
    workspaceDirectory: command.workspaceDirectory,
    gitBranch: command.gitBranch,
    blockId: command.blockId,
    sessionId: workflowSessionId,
    runId: command.runId,
    generation: 1,
    id: workflowSessionId,
    terminalBlockId: command.blockId,
    workspaceId: command.workspaceId,
    workingDirectory: command.workingDirectory,
    processId: 1,
    status: 'running',
    kind: 'workflow',
    retentionPolicy: 'terminate-on-application-exit',
    recoveryKind: 'fresh',
    terminalSourceTheme: 'dark',
    inputHistory: [],
    exitCode: null,
    failureReason: null
  }
}
