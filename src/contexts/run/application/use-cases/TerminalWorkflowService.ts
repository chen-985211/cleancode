import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { WorkflowRun } from '../../domain/aggregates/WorkflowRun'
import type {
  WorkflowRunFailureSnapshot,
  WorkflowRunPlanNodeSnapshot,
  WorkflowRunSnapshot
} from '../dto/WorkflowRunSnapshot'
import type {
  StartTerminalWorkflowCommand,
  TerminalWorkflowScopeCommand
} from '../dto/TerminalWorkflowCommand'
import type { TerminalExitEvent, TerminalOutputEvent } from '../ports/TerminalProcessPort'
import type { TcpReadinessPort } from '../ports/TcpReadinessPort'
import type { TerminalWorkflowEventPublisherPort } from '../ports/TerminalWorkflowEventPublisherPort'
import type { TerminalWorkflowPlanPort } from '../ports/TerminalWorkflowPlanPort'
import type {
  StartWorkflowRuntimeCommand,
  TerminalWorkflowRuntimePort
} from '../ports/TerminalWorkflowRuntimePort'
import type { ManagedServiceLauncher } from '../services/ManagedServiceLauncher'
import {
  ActiveWorkflowRunRegistry,
  beginWorkflowHardDispose,
  createWorkflowRunOwners,
  trackWorkflowRun,
  type ActiveWorkflowRun
} from '../services/TerminalWorkflowRuntimeState'
import { isServicePortConflictFailure, toWorkflowFailure } from '../services/WorkflowFailure'
import type { RunLifecycleService } from './RunLifecycleService'

export type {
  StartTerminalWorkflowCommand,
  TerminalWorkflowScopeCommand
} from '../dto/TerminalWorkflowCommand'

export class TerminalWorkflowService {
  private readonly activeRuns = new ActiveWorkflowRunRegistry()

  constructor(
    private readonly planPort: TerminalWorkflowPlanPort,
    private readonly runtimePort: TerminalWorkflowRuntimePort,
    _tcpReadinessPort: TcpReadinessPort,
    private readonly eventPublisher: TerminalWorkflowEventPublisherPort,
    private readonly managedServices?: ManagedServiceLauncher,
    private readonly lifecycle?: RunLifecycleService
  ) {}

  async start(command: StartTerminalWorkflowCommand): Promise<WorkflowRunSnapshot> {
    const existing = this.findActiveRun(command)
    if (existing) {
      await beginWorkflowHardDispose(existing, () => this.performHardDispose(existing))
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
      run: WorkflowRun.create(plan, {
        projectId: command.projectId,
        projectDirectory: command.projectDirectory,
        workspaceName: command.workspaceName,
        workspaceDirectory: command.workspaceDirectory,
        gitBranch: command.gitBranch
      }),
      plan,
      command,
      sessionIds: new Map(),
      timeoutIds: new Map(),
      readinessControllers: new Map(),
      outputTails: new Map(),
      handoffStarted: new Set(),
      pendingNodeStarts: new Set(),
      lifecycleUnregisters: [],
      hardDisposing: false,
      hardDisposePromise: null
    }
    const register = async (): Promise<void> => {
      this.activeRuns.store(activeRun)
      trackWorkflowRun(this.lifecycle, activeRun, () =>
        beginWorkflowHardDispose(activeRun, () => this.performHardDispose(activeRun))
      )
      this.publishRun(activeRun)
    }
    if (this.lifecycle) {
      await this.lifecycle.runStartMany(createWorkflowRunOwners(activeRun), register)
    } else {
      await register()
    }
    await this.schedule(activeRun)

    return activeRun.run.toSnapshot()
  }

  getActiveRun(scope: TerminalWorkflowScopeCommand): WorkflowRunSnapshot | null {
    return this.findActiveRun(scope)?.run.toSnapshot() ?? null
  }

  async stop(scope: TerminalWorkflowScopeCommand): Promise<WorkflowRunSnapshot | null> {
    const activeRun = this.findActiveRun(scope)

    if (!activeRun) {
      return null
    }

    for (const blockId of activeRun.run.getStoppableBlockIds()) {
      this.clearNodeGuards(activeRun, blockId)
      activeRun.run.markStopped(blockId)
      const sessionId = activeRun.sessionIds.get(blockId)

      if (sessionId) {
        await this.stopSession(sessionId)
      }
      activeRun.run.clearActualEndpoint(blockId)
      await this.handoffToInteractive(activeRun, blockId)
    }

    this.publishRun(activeRun)

    return activeRun.run.toSnapshot()
  }

  async stopAll(): Promise<void> {
    const results = await Promise.allSettled(
      this.activeRuns
        .list()
        .map((activeRun) =>
          beginWorkflowHardDispose(activeRun, () => this.performHardDispose(activeRun))
        )
    )
    const failures = results.flatMap((result) =>
      result.status === 'rejected' ? [result.reason] : []
    )
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Multiple terminal workflows failed to stop.')
    }
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
    await Promise.all(runnableNodes.map((node) => this.trackNodeStart(activeRun, node)))
  }

  private trackNodeStart(
    activeRun: ActiveWorkflowRun,
    node: WorkflowRunPlanNodeSnapshot
  ): Promise<void> {
    const starting = this.startNode(activeRun, node).finally(() => {
      activeRun.pendingNodeStarts.delete(starting)
    })
    activeRun.pendingNodeStarts.add(starting)
    return starting
  }

  private async startNode(
    activeRun: ActiveWorkflowRun,
    node: WorkflowRunPlanNodeSnapshot
  ): Promise<void> {
    try {
      if (node.executionConfig.mode === 'service' && node.executionConfig.port) {
        await this.startManagedServiceNode(activeRun, node)
        return
      }
      const session = await this.runtimePort.startCommand(
        this.createRuntimeCommand(activeRun, node.blockId, node.launchCommand)
      )
      if (!this.isCurrent(activeRun)) {
        await this.runtimePort.stop(session.id)
        return
      }
      activeRun.sessionIds.set(node.blockId, session.id)
      this.eventPublisher.publish({
        type: 'terminal-session-started',
        blockId: node.blockId,
        session,
        clearOutput: true,
        endpoint: null
      })
      this.armNodeGuards(activeRun, node)
    } catch (error) {
      if (!this.isCurrent(activeRun)) return
      const failure = toWorkflowFailure(error)
      if (isServicePortConflictFailure(failure)) {
        this.eventPublisher.publish({ type: 'service-port-conflict', failure })
      }
      activeRun.run.markFailed(node.blockId, failure)
      this.publishRun(activeRun)
      await this.schedule(activeRun)
    }
  }

  private async startManagedServiceNode(
    activeRun: ActiveWorkflowRun,
    node: WorkflowRunPlanNodeSnapshot
  ): Promise<void> {
    if (
      !this.managedServices ||
      node.executionConfig.mode !== 'service' ||
      !node.executionConfig.port
    ) {
      throw createExpectedAppError(
        'SERVICE_PORT_MANAGEMENT_UNSUPPORTED',
        'Managed local service launching is unavailable.'
      )
    }

    const controller = new AbortController()
    activeRun.readinessControllers.set(node.blockId, controller)
    const managedRun = await this.managedServices.launch({
      projectId: activeRun.command.projectId,
      projectDirectory: activeRun.command.projectDirectory,
      workspaceName: activeRun.command.workspaceName,
      workspaceDirectory: activeRun.command.workspaceDirectory,
      gitBranch: activeRun.command.gitBranch,
      blockId: node.blockId,
      workingDirectory: activeRun.command.workingDirectory,
      launchCommand: node.launchCommand,
      shell: activeRun.command.shell,
      columns: activeRun.command.columns,
      rows: activeRun.command.rows,
      runId: activeRun.run.id,
      portIntent: node.executionConfig.port,
      readiness: node.executionConfig.readiness,
      readinessTimeoutMs: node.executionConfig.readinessTimeoutMs,
      signal: controller.signal,
      onOutput: (event) => this.handleOutput(activeRun, node.blockId, event),
      onExit: (event) => void this.handleExit(activeRun, node.blockId, event),
      onSessionStarted: (session) => {
        if (!this.isCurrent(activeRun)) return
        activeRun.sessionIds.set(node.blockId, session.id)
        this.eventPublisher.publish({
          type: 'terminal-session-started',
          blockId: node.blockId,
          session,
          clearOutput: true,
          endpoint: null
        })
        this.publishRun(activeRun)
      },
      onEndpointConfirmed: (session, endpoint) => {
        if (!this.isCurrent(activeRun)) return
        activeRun.run.recordActualEndpoint(node.blockId, endpoint)
        this.eventPublisher.publish({ type: 'service-endpoint-updated', scope: session, endpoint })
        this.publishRun(activeRun)
      },
      onPortStateChanged: (session, _endpoint, state) => {
        this.eventPublisher.publish({
          type: 'service-port-state-changed',
          scope: session,
          state
        })
      },
      onCleanupFailed: (error) => {
        if (!this.isCurrent(activeRun)) return
        activeRun.run.recordCleanupFailure(node.blockId, toWorkflowFailure(error))
        this.publishRun(activeRun)
      }
    })

    if (!this.isCurrent(activeRun)) {
      await this.managedServices.stop(managedRun.session.id)
      return
    }
    activeRun.sessionIds.set(node.blockId, managedRun.session.id)
    activeRun.run.recordActualEndpoint(node.blockId, managedRun.endpoint)
    activeRun.run.markServiceReady(node.blockId)
    activeRun.readinessControllers.delete(node.blockId)
    this.publishRun(activeRun)
    await this.schedule(activeRun)
  }

  private createRuntimeCommand(
    activeRun: ActiveWorkflowRun,
    blockId: string,
    launchCommand: string
  ): StartWorkflowRuntimeCommand {
    return {
      blockId,
      projectId: activeRun.command.projectId,
      projectDirectory: activeRun.command.projectDirectory,
      workspaceName: activeRun.command.workspaceName,
      workspaceDirectory: activeRun.command.workspaceDirectory,
      gitBranch: activeRun.command.gitBranch,
      workingDirectory: activeRun.command.workingDirectory,
      runId: activeRun.run.id,
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

    if (
      node.executionConfig.mode === 'service' &&
      !node.executionConfig.port &&
      node.executionConfig.readiness.type === 'tcp'
    ) {
      void this.failNode(activeRun, node.blockId, {
        code: 'SERVICE_PORT_MANAGEMENT_UNSUPPORTED',
        message: 'TCP service readiness requires a managed port intent.'
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
      Boolean(node.executionConfig.port) ||
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
    await this.failNode(activeRun, blockId, {
      code: 'COMMAND_TIMED_OUT',
      message: 'Terminal command timed out.'
    })
  }

  private async failNode(
    activeRun: ActiveWorkflowRun,
    blockId: string,
    failure: WorkflowRunFailureSnapshot
  ): Promise<void> {
    if (!this.isCurrent(activeRun)) {
      return
    }

    this.clearNodeGuards(activeRun, blockId)
    activeRun.run.markFailed(blockId, failure)
    const sessionId = activeRun.sessionIds.get(blockId)

    if (sessionId) {
      await this.stopSession(sessionId)
    }
    this.publishRun(activeRun)
    await this.handoffToInteractive(activeRun, blockId)
    await this.schedule(activeRun)
  }

  private async handoffToInteractive(activeRun: ActiveWorkflowRun, blockId: string): Promise<void> {
    if (!this.isCurrent(activeRun) || activeRun.handoffStarted.has(blockId)) {
      return
    }

    activeRun.handoffStarted.add(blockId)
    const session = await this.runtimePort.startInteractive(
      this.createRuntimeCommand(activeRun, blockId, '')
    )
    if (!this.isCurrent(activeRun)) {
      await this.runtimePort.stop(session.id)
      return
    }
    activeRun.sessionIds.set(blockId, session.id)
    this.eventPublisher.publish({
      type: 'terminal-session-started',
      blockId,
      session,
      clearOutput: false,
      endpoint: null
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
    return !activeRun.hardDisposing && this.findActiveRun(activeRun.command) === activeRun
  }

  private async performHardDispose(activeRun: ActiveWorkflowRun): Promise<void> {
    for (const node of activeRun.plan.nodes) this.clearNodeGuards(activeRun, node.blockId)
    await Promise.allSettled([...activeRun.pendingNodeStarts])
    for (const node of activeRun.plan.nodes) this.clearNodeGuards(activeRun, node.blockId)

    for (const blockId of activeRun.run.getStoppableBlockIds()) {
      activeRun.run.markStopped(blockId)
      activeRun.run.clearActualEndpoint(blockId)
    }
    const stopResults = await Promise.allSettled(
      [...new Set(activeRun.sessionIds.values())].map((sessionId) => this.stopSession(sessionId))
    )
    const failedStop = stopResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected'
    )
    if (failedStop) {
      this.publishRun(activeRun)
      throw failedStop.reason
    }

    activeRun.outputTails.clear()
    this.activeRuns.remove(activeRun)
    for (const unregister of activeRun.lifecycleUnregisters.splice(0)) unregister()
    this.publishRun(activeRun)
  }

  private async stopSession(sessionId: string): Promise<void> {
    const managedServices = this.managedServices
    const managed = managedServices?.getActive(sessionId)
    if (managedServices && managed) {
      await managedServices.stop(sessionId)
      this.eventPublisher.publish({
        type: 'service-endpoint-updated',
        scope: managed.scope,
        endpoint: null
      })
      return
    }
    await this.runtimePort.stop(sessionId)
  }

  private findActiveRun(scope: TerminalWorkflowScopeCommand): ActiveWorkflowRun | undefined {
    return this.activeRuns.find(scope)
  }
}
