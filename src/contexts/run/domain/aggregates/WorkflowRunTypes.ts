export type WorkflowRunNodeStatus =
  'waiting' | 'running' | 'ready' | 'succeeded' | 'failed' | 'blocked' | 'stopped'

export type WorkflowRunStatus = 'running' | 'ready' | 'succeeded' | 'failed' | 'stopped'

interface WorkflowTaskExecutionConfigSnapshot {
  readonly mode: 'task'
  readonly successExitCodes: readonly number[]
  readonly timeoutMs: number | null
}

interface WorkflowServiceExecutionConfigSnapshot {
  readonly mode: 'service'
  readonly readiness:
    | { readonly type: 'output'; readonly text: string }
    | { readonly type: 'tcp'; readonly port: number }
  readonly readinessTimeoutMs: number
}

type WorkflowExecutionConfigSnapshot =
  WorkflowTaskExecutionConfigSnapshot | WorkflowServiceExecutionConfigSnapshot

export interface WorkflowRunPlanNodeSnapshot {
  readonly blockId: string
  readonly name: string
  readonly launchCommand: string
  readonly executionConfig: WorkflowExecutionConfigSnapshot
  readonly dependencyBlockIds: readonly string[]
}

export interface WorkflowRunPlanSnapshot {
  readonly graphId: string
  readonly workspaceName: string
  readonly nodes: readonly WorkflowRunPlanNodeSnapshot[]
}

export interface WorkflowRunNodeSnapshot extends WorkflowRunPlanNodeSnapshot {
  readonly status: WorkflowRunNodeStatus
  readonly exitCode: number | null
  readonly failureReason: string | null
}

export interface WorkflowRunSnapshot {
  readonly id: string
  readonly graphId: string
  readonly workspaceName: string
  readonly status: WorkflowRunStatus
  readonly nodes: readonly WorkflowRunNodeSnapshot[]
}
