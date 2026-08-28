import type { WorkflowRun } from '../../domain/aggregates/WorkflowRun'
import type { TerminalRunOwner } from '../../domain/value-objects/TerminalRunScope'
import type { WorkflowRunPlanSnapshot } from '../dto/WorkflowRunSnapshot'
import type { StartTerminalWorkflowCommand } from '../dto/TerminalWorkflowCommand'
import type { RunLifecycleService } from '../use-cases/RunLifecycleService'

export interface ActiveWorkflowRun {
  readonly run: WorkflowRun
  readonly plan: WorkflowRunPlanSnapshot
  readonly command: StartTerminalWorkflowCommand
  readonly sessionIds: Map<string, string>
  readonly timeoutIds: Map<string, ReturnType<typeof setTimeout>>
  readonly readinessControllers: Map<string, AbortController>
  readonly outputTails: Map<string, string>
  readonly pendingNodeStarts: Set<Promise<void>>
  readonly lifecycleUnregisters: Array<() => void>
  hardDisposing: boolean
  hardDisposePromise: Promise<void> | null
}

export class ActiveWorkflowRunRegistry {
  private readonly runsByProject = new Map<string, Map<string, Map<string, ActiveWorkflowRun>>>()

  find(scope: {
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly runId: string
  }): ActiveWorkflowRun | undefined {
    return this.runsByProject.get(scope.projectDirectory)?.get(scope.workspaceId)?.get(scope.runId)
  }

  listScope(scope: {
    readonly projectDirectory: string
    readonly workspaceId: string
  }): readonly ActiveWorkflowRun[] {
    return [
      ...(this.runsByProject.get(scope.projectDirectory)?.get(scope.workspaceId)?.values() ?? [])
    ]
  }

  store(activeRun: ActiveWorkflowRun): void {
    const { projectDirectory, workspaceId } = activeRun.command
    let workspaceRuns = this.runsByProject.get(projectDirectory)
    if (!workspaceRuns) {
      workspaceRuns = new Map()
      this.runsByProject.set(projectDirectory, workspaceRuns)
    }
    let activeRuns = workspaceRuns.get(workspaceId)
    if (!activeRuns) {
      activeRuns = new Map()
      workspaceRuns.set(workspaceId, activeRuns)
    }
    activeRuns.set(activeRun.run.id, activeRun)
  }

  remove(activeRun: ActiveWorkflowRun): void {
    const { projectDirectory, workspaceId } = activeRun.command
    const workspaceRuns = this.runsByProject.get(projectDirectory)
    const activeRuns = workspaceRuns?.get(workspaceId)
    if (activeRuns?.get(activeRun.run.id) !== activeRun) return
    activeRuns.delete(activeRun.run.id)
    if (activeRuns.size === 0) workspaceRuns?.delete(workspaceId)
    if (workspaceRuns?.size === 0) this.runsByProject.delete(projectDirectory)
  }

  list(): readonly ActiveWorkflowRun[] {
    return [...this.runsByProject.values()].flatMap((workspaceRuns) =>
      [...workspaceRuns.values()].flatMap((activeRuns) => [...activeRuns.values()])
    )
  }
}

export function createWorkflowRunOwners(activeRun: ActiveWorkflowRun): readonly TerminalRunOwner[] {
  return activeRun.plan.nodes.map((node) => ({
    projectId: activeRun.command.projectId,
    projectDirectory: activeRun.command.projectDirectory,
    workspaceId: activeRun.command.workspaceId,
    workspaceDirectory: activeRun.command.workspaceDirectory,
    gitBranch: activeRun.command.gitBranch,
    blockId: node.blockId
  }))
}

export function trackWorkflowRun(
  lifecycle: RunLifecycleService | undefined,
  activeRun: ActiveWorkflowRun,
  dispose: () => Promise<void>
): void {
  if (!lifecycle) return
  for (const owner of createWorkflowRunOwners(activeRun)) {
    activeRun.lifecycleUnregisters.push(lifecycle.track(owner, dispose))
  }
}

export function beginWorkflowHardDispose(
  activeRun: ActiveWorkflowRun,
  dispose: () => Promise<void>
): Promise<void> {
  if (activeRun.hardDisposePromise) return activeRun.hardDisposePromise
  activeRun.hardDisposing = true
  const disposal = dispose()
  activeRun.hardDisposePromise = disposal
  void disposal.then(undefined, () => {
    if (activeRun.hardDisposePromise === disposal) activeRun.hardDisposePromise = null
  })
  return disposal
}
