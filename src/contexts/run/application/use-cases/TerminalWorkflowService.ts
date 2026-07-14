import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { WorkflowRun } from '../../domain/aggregates/WorkflowRun'
import type {
  WorkflowRunPlanNodeSnapshot,
  WorkflowRunPlanSnapshot,
  WorkflowRunSnapshot
} from '../dto/WorkflowRunSnapshot'
import type { TerminalExitEvent, TerminalOutputEvent } from '../ports/TerminalProcessPort'
import type { TcpReadinessPort } from '../ports/TcpReadinessPort'
import type { TerminalWorkflowEventPublisherPort } from '../ports/TerminalWorkflowEventPublisherPort'
import type {
  TerminalWorkflowPlanPort,
  TerminalWorkflowPlanScope
} from '../ports/TerminalWorkflowPlanPort'
import type {
  StartWorkflowRuntimeCommand,
  TerminalWorkflowRuntimePort
} from '../ports/TerminalWorkflowRuntimePort'

export interface StartTerminalWorkflowCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly workingDirectory: string
  readonly scope: TerminalWorkflowPlanScope
  readonly shell?: string
  readonly columns?: number
  readonly rows?: number
}

interface ActiveWorkflowRun {
  readonly run: WorkflowRun
  readonly plan: WorkflowRunPlanSnapshot
  readonly command: StartTerminalWorkflowCommand
  readonly sessionIds: Map<string, string>
  readonly timeoutIds: Map<string, ReturnType<typeof setTimeout>>
  readonly readinessControllers: Map<string, AbortController>
  readonly outputTails: Map<string, string>
  readonly handoffStarted: Set<string>
}

export class TerminalWorkflowService {
  private readonly activeRuns = new Map<string, ActiveWorkflowRun>()

  constructor(
    private readonly planPort: TerminalWorkflowPlanPort,
    private readonly runtimePort: TerminalWorkflowRuntimePort,
    private readonly tcpReadinessPort: TcpReadinessPort,
    private readonly eventPublisher: TerminalWorkflowEventPublisherPort
  ) {}

  async start(command: StartTerminalWorkflowCommand): Promise<WorkflowRunSnapshot> {
    if (this.activeRuns.has(command.workspaceName)) {
      await this.stop(command.workspaceName)
    }

    const plan = await this.planPort.buildPlan({
      projectDirectory: command.projectDirectory,
      workspaceName: command.workspaceName,
      scope: command.scope
    })

    if (plan.nodes.length === 0) {
      throw createExpectedAppError(
        'TERMINAL_WORKFLOW_EMPTY',
        'Terminal workflow has no configured commands.'
      )
    }

    const activeRun: ActiveWorkflowRun = {
      run: WorkflowRun.create(plan),
      plan,
      command,
      sessionIds: new Map(),
      timeoutIds: new Map(),
      readinessControllers: new Map(),
      outputTails: new Map(),
      handoffStarted: new Set()
    }
    this.activeRuns.set(command.workspaceName, activeRun)
    this.publishRun(activeRun)
    await this.schedule(activeRun)

    return activeRun.run.toSnapshot()
  }

  getActiveRun(workspaceName: string): WorkflowRunSnapshot | null {
    return this.activeRuns.get(workspaceName)?.run.toSnapshot() ?? null
  }

  async stop(workspaceName: string): Promise<WorkflowRunSnapshot | null> {
    const activeRun = this.activeRuns.get(workspaceName)

    if (!activeRun) {
      return null
    }

    for (const blockId of activeRun.run.getStoppableBlockIds()) {
      this.clearNodeGuards(activeRun, blockId)
      activeRun.run.markStopped(blockId)
      const sessionId = activeRun.sessionIds.get(blockId)

      if (sessionId) {
        this.runtimePort.stop(sessionId)
      }
      await this.handoffToInteractive(activeRun, blockId)
    }

    this.publishRun(activeRun)

    return activeRun.run.toSnapshot()
  }

  private async schedule(activeRun: ActiveWorkflowRun): Promise<void> {
    if (!this.isCurrent(activeRun)) {
      return
    }

    const runnableNodes = activeRun.run.takeRunnableNodes()

    if (runnableNodes.length === 0) {
      this.publishRun(activeRun)
      return
    }

    this.publishRun(activeRun)
    await Promise.all(runnableNodes.map((node) => this.startNode(activeRun, node)))
  }

  private async startNode(
    activeRun: ActiveWorkflowRun,
    node: WorkflowRunPlanNodeSnapshot
  ): Promise<void> {
    try {
      const session = await this.runtimePort.startCommand(
        this.createRuntimeCommand(activeRun, node.blockId, node.launchCommand)
      )
      activeRun.sessionIds.set(node.blockId, session.id)
      this.eventPublisher.publish({
        type: 'terminal-session-started',
        blockId: node.blockId,
        session,
        clearOutput: true
      })
      this.armNodeGuards(activeRun, node)
    } catch (error) {
      activeRun.run.markFailed(node.blockId, getErrorMessage(error))
      this.publishRun(activeRun)
      await this.schedule(activeRun)
    }
  }

  private createRuntimeCommand(
    activeRun: ActiveWorkflowRun,
    blockId: string,
    launchCommand: string
  ): StartWorkflowRuntimeCommand {
    return {
      blockId,
      workspaceName: activeRun.command.workspaceName,
      workingDirectory: activeRun.command.workingDirectory,
      launchCommand,
      shell: activeRun.command.shell,
      columns: activeRun.command.columns,
      rows: activeRun.command.rows,
      onOutput: (event) => this.handleOutput(activeRun, blockId, event),
      onExit: (event) => void this.handleExit(activeRun, blockId, event)
    }
  }

  private armNodeGuards(activeRun: ActiveWorkflowRun, node: WorkflowRunPlanNodeSnapshot): void {
    const timeoutMs =
      node.executionConfig.mode === 'task'
        ? node.executionConfig.timeoutMs
        : node.executionConfig.readinessTimeoutMs

    if (timeoutMs !== null) {
      activeRun.timeoutIds.set(
        node.blockId,
        setTimeout(() => void this.handleTimeout(activeRun, node.blockId), timeoutMs)
      )
    }

    if (node.executionConfig.mode === 'service' && node.executionConfig.readiness.type === 'tcp') {
      const controller = new AbortController()
      activeRun.readinessControllers.set(node.blockId, controller)
      void this.tcpReadinessPort
        .waitUntilReady({ port: node.executionConfig.readiness.port, signal: controller.signal })
        .then(() => this.markServiceReady(activeRun, node.blockId))
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            void this.failNode(activeRun, node.blockId, getErrorMessage(error))
          }
        })
    }
  }

  private handleOutput(
    activeRun: ActiveWorkflowRun,
    blockId: string,
    output: TerminalOutputEvent
  ): void {
    if (!this.isCurrent(activeRun)) {
      return
    }

    this.eventPublisher.publish({ type: 'terminal-output', blockId, output })
    const node = activeRun.plan.nodes.find((candidate) => candidate.blockId === blockId)

    if (
      node?.executionConfig.mode !== 'service' ||
      node.executionConfig.readiness.type !== 'output'
    ) {
      return
    }

    const text = node.executionConfig.readiness.text
    const combined = `${activeRun.outputTails.get(blockId) ?? ''}${output.data}`

    if (combined.includes(text)) {
      this.markServiceReady(activeRun, blockId)
    } else {
      activeRun.outputTails.set(blockId, combined.slice(Math.min(0, 1 - text.length)))
    }
  }

  private markServiceReady(activeRun: ActiveWorkflowRun, blockId: string): void {
    const node = activeRun.run.toSnapshot().nodes.find((candidate) => candidate.blockId === blockId)

    if (!this.isCurrent(activeRun) || node?.status !== 'running') {
      return
    }

    this.clearNodeGuards(activeRun, blockId)
    activeRun.run.markServiceReady(blockId)
    this.publishRun(activeRun)
    void this.schedule(activeRun)
  }

  private async handleExit(
    activeRun: ActiveWorkflowRun,
    blockId: string,
    event: TerminalExitEvent
  ): Promise<void> {
    if (!this.isCurrent(activeRun)) {
      return
    }

    this.clearNodeGuards(activeRun, blockId)
    activeRun.run.recordProcessExit(blockId, event.exitCode)
    this.publishRun(activeRun)
    await this.handoffToInteractive(activeRun, blockId)
    await this.schedule(activeRun)
  }

  private async handleTimeout(activeRun: ActiveWorkflowRun, blockId: string): Promise<void> {
    await this.failNode(activeRun, blockId, 'Terminal command timed out.')
  }

  private async failNode(
    activeRun: ActiveWorkflowRun,
    blockId: string,
    reason: string
  ): Promise<void> {
    if (!this.isCurrent(activeRun)) {
      return
    }

    this.clearNodeGuards(activeRun, blockId)
    activeRun.run.markFailed(blockId, reason)
    const sessionId = activeRun.sessionIds.get(blockId)

    if (sessionId) {
      this.runtimePort.stop(sessionId)
    }
    this.publishRun(activeRun)
    await this.handoffToInteractive(activeRun, blockId)
    await this.schedule(activeRun)
  }

  private async handoffToInteractive(activeRun: ActiveWorkflowRun, blockId: string): Promise<void> {
    if (activeRun.handoffStarted.has(blockId)) {
      return
    }

    activeRun.handoffStarted.add(blockId)
    const session = await this.runtimePort.startInteractive(
      this.createRuntimeCommand(activeRun, blockId, '')
    )
    activeRun.sessionIds.set(blockId, session.id)
    this.eventPublisher.publish({
      type: 'terminal-session-started',
      blockId,
      session,
      clearOutput: false
    })
  }

  private clearNodeGuards(activeRun: ActiveWorkflowRun, blockId: string): void {
    const timeoutId = activeRun.timeoutIds.get(blockId)

    if (timeoutId) {
      clearTimeout(timeoutId)
      activeRun.timeoutIds.delete(blockId)
    }
    activeRun.readinessControllers.get(blockId)?.abort()
    activeRun.readinessControllers.delete(blockId)
  }

  private publishRun(activeRun: ActiveWorkflowRun): void {
    this.eventPublisher.publish({ type: 'run-updated', run: activeRun.run.toSnapshot() })
  }

  private isCurrent(activeRun: ActiveWorkflowRun): boolean {
    return this.activeRuns.get(activeRun.command.workspaceName) === activeRun
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
