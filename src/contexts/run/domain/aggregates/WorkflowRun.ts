import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { ActualServiceEndpoint } from '../value-objects/ActualServiceEndpoint'
import type {
  WorkflowRunFailureSnapshot,
  WorkflowRunNodeSnapshot,
  WorkflowRunPlanNodeSnapshot,
  WorkflowRunPlanSnapshot,
  WorkflowRunScopeSnapshot,
  WorkflowRunSnapshot,
  WorkflowRunStatus
} from './WorkflowRunTypes'

interface MutableWorkflowRunNode {
  readonly plan: WorkflowRunPlanNodeSnapshot
  status: WorkflowRunNodeSnapshot['status']
  exitCode: number | null
  failureReason: string | null
  endpoint: ActualServiceEndpoint | null
  error: WorkflowRunFailureSnapshot | null
}

export class WorkflowRun {
  private readonly plan: WorkflowRunPlanSnapshot
  private readonly nodes: MutableWorkflowRunNode[]
  private stopRequested = false

  private constructor(
    public readonly id: string,
    plan: WorkflowRunPlanSnapshot,
    private readonly scope: WorkflowRunScopeSnapshot
  ) {
    this.plan = freezePlan(plan)
    this.nodes = this.plan.nodes.map((node) => ({
      plan: node,
      status: 'waiting',
      exitCode: null,
      failureReason: null,
      endpoint: null,
      error: null
    }))
  }

  static create(
    plan: WorkflowRunPlanSnapshot,
    scope: WorkflowRunScopeSnapshot,
    id = createRunId()
  ): WorkflowRun {
    return new WorkflowRun(id, plan, Object.freeze({ ...scope }))
  }

  takeRunnableNodes(): readonly WorkflowRunPlanNodeSnapshot[] {
    if (this.stopRequested) return []
    const runnable = this.nodes.filter(
      (node) => node.status === 'waiting' && this.areDependenciesSatisfied(node.plan)
    )
    for (const node of runnable) node.status = 'running'
    return runnable.map((node) => node.plan)
  }

  markServiceReady(blockId: string): void {
    const node = this.requireNode(blockId)
    if (node.plan.executionConfig.mode !== 'service' || node.status !== 'running') {
      throwInvalidTransition(blockId)
    }
    node.status = 'ready'
  }

  recordActualEndpoint(blockId: string, endpoint: ActualServiceEndpoint): void {
    const node = this.requireNode(blockId)
    if (node.plan.executionConfig.mode !== 'service') throwInvalidTransition(blockId)
    node.endpoint = endpoint
  }

  clearActualEndpoint(blockId: string): void {
    const node = this.requireNode(blockId)
    node.endpoint = null
  }

  recordProcessExit(blockId: string, exitCode: number | null): void {
    const node = this.requireNode(blockId)
    if (isTerminalNodeStatus(node.status)) return
    node.exitCode = exitCode
    if (
      node.plan.executionConfig.mode === 'task' &&
      exitCode !== null &&
      node.plan.executionConfig.successExitCodes.includes(exitCode)
    ) {
      node.status = 'succeeded'
      return
    }

    node.status = 'failed'
    node.failureReason =
      node.plan.executionConfig.mode === 'service'
        ? 'Service exited before the workflow was stopped.'
        : `Command exited with code ${exitCode ?? 'unknown'}.`
    node.error = {
      code: node.plan.executionConfig.mode === 'service' ? 'SERVICE_EXITED' : 'COMMAND_EXIT_FAILED',
      message: node.failureReason
    }
    this.blockFailedDescendants()
  }

  markFailed(blockId: string, failure: string | WorkflowRunFailureSnapshot): void {
    const node = this.requireNode(blockId)
    if (isTerminalNodeStatus(node.status)) return
    node.status = 'failed'
    node.error =
      typeof failure === 'string' ? { code: 'UNEXPECTED_ERROR', message: failure } : failure
    node.failureReason = node.error.message
    this.blockFailedDescendants()
  }

  recordCleanupFailure(blockId: string, failure: WorkflowRunFailureSnapshot): void {
    const node = this.requireNode(blockId)
    node.status = 'failed'
    node.error = failure
    node.failureReason = failure.message
    this.blockFailedDescendants()
  }

  getStoppableBlockIds(): readonly string[] {
    this.stopRequested = true
    const stoppableBlockIds = this.nodes
      .filter((node) => node.status === 'running' || node.status === 'ready')
      .map((node) => node.plan.blockId)
      .reverse()
    for (const node of this.nodes) {
      if (node.status === 'waiting') node.status = 'stopped'
    }
    return stoppableBlockIds
  }

  markStopped(blockId: string): void {
    const node = this.requireNode(blockId)
    if (node.status === 'running' || node.status === 'ready' || node.status === 'waiting') {
      node.status = 'stopped'
    }
  }

  toSnapshot(): WorkflowRunSnapshot {
    return {
      ...this.scope,
      id: this.id,
      graphId: this.plan.graphId,
      status: this.resolveStatus(),
      nodes: this.nodes.map((node) => ({
        ...node.plan,
        status: node.status,
        exitCode: node.exitCode,
        failureReason: node.failureReason,
        endpoint: node.endpoint,
        error: node.error
      }))
    }
  }

  private areDependenciesSatisfied(planNode: WorkflowRunPlanNodeSnapshot): boolean {
    return planNode.dependencyBlockIds.every((dependencyBlockId) => {
      const dependency = this.requireNode(dependencyBlockId)
      return dependency.status === 'succeeded' || dependency.status === 'ready'
    })
  }

  private blockFailedDescendants(): void {
    let hasBlockedNode = true
    while (hasBlockedNode) {
      hasBlockedNode = false
      for (const node of this.nodes) {
        if (
          node.status === 'waiting' &&
          node.plan.dependencyBlockIds.some((dependencyId) => {
            const dependency = this.requireNode(dependencyId)
            return dependency.status === 'failed' || dependency.status === 'blocked'
          })
        ) {
          node.status = 'blocked'
          node.failureReason = 'An upstream terminal failed.'
          node.error = { code: 'UPSTREAM_FAILED', message: node.failureReason }
          hasBlockedNode = true
        }
      }
    }
  }

  private resolveStatus(): WorkflowRunStatus {
    if (this.stopRequested && this.nodes.every((node) => node.status !== 'running'))
      return 'stopped'
    if (this.nodes.some((node) => node.status === 'running' || node.status === 'waiting')) {
      return 'running'
    }
    if (this.nodes.some((node) => node.status === 'failed')) return 'failed'
    if (this.nodes.some((node) => node.status === 'ready')) return 'ready'
    return 'succeeded'
  }

  private requireNode(blockId: string): MutableWorkflowRunNode {
    const node = this.nodes.find((candidate) => candidate.plan.blockId === blockId)
    if (!node) {
      throw createExpectedAppError('TERMINAL_BLOCK_NOT_FOUND', 'Terminal block was not found.')
    }
    return node
  }
}

function isTerminalNodeStatus(status: WorkflowRunNodeSnapshot['status']): boolean {
  return (
    status === 'succeeded' || status === 'failed' || status === 'blocked' || status === 'stopped'
  )
}

function freezePlan(plan: WorkflowRunPlanSnapshot): WorkflowRunPlanSnapshot {
  return Object.freeze({
    ...plan,
    nodes: Object.freeze(
      plan.nodes.map((node) =>
        Object.freeze({ ...node, dependencyBlockIds: Object.freeze([...node.dependencyBlockIds]) })
      )
    )
  })
}

function throwInvalidTransition(blockId: string): never {
  throw createExpectedAppError(
    'TERMINAL_WORKFLOW_STATE_INVALID',
    'Terminal workflow state transition is invalid.',
    { blockId }
  )
}

function createRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `workflow-run-${Date.now()}-${Math.random()}`
}
