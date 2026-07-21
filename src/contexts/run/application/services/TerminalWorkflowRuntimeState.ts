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
  readonly handoffStarted: Set<string>
  readonly pendingNodeStarts: Set<Promise<void>>
  readonly lifecycleUnregisters: Array<() => void>
  hardDisposing: boolean
  hardDisposePromise: Promise<void> | null
}

export class ActiveWorkflowRunRegistry {
  private readonly runsByProject = new Map<string, Map<string, ActiveWorkflowRun>>()

  find(scope: { readonly projectDirectory: string; readonly workspaceName: string }) {
    return this.runsByProject.get(scope.projectDirectory)?.get(scope.workspaceName)
  }

  store(activeRun: ActiveWorkflowRun): void {
    const { projectDirectory, workspaceName } = activeRun.command
    let projectRuns = this.runsByProject.get(projectDirectory)
    if (!projectRuns) {
      projectRuns = new Map()
      this.runsByProject.set(projectDirectory, projectRuns)
    }
    projectRuns.set(workspaceName, activeRun)
  }

  remove(activeRun: ActiveWorkflowRun): void {
    const { projectDirectory, workspaceName } = activeRun.command
    const projectRuns = this.runsByProject.get(projectDirectory)
    if (projectRuns?.get(workspaceName) !== activeRun) return
    projectRuns.delete(workspaceName)
    if (projectRuns.size === 0) this.runsByProject.delete(projectDirectory)
  }

  list(): readonly ActiveWorkflowRun[] {
    return [...this.runsByProject.values()].flatMap((projectRuns) => [...projectRuns.values()])
  }
}

export function createWorkflowRunOwners(activeRun: ActiveWorkflowRun): readonly TerminalRunOwner[] {
  return activeRun.plan.nodes.map((node) => ({
    projectId: activeRun.command.projectId,
    projectDirectory: activeRun.command.projectDirectory,
    workspaceName: activeRun.command.workspaceName,
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
