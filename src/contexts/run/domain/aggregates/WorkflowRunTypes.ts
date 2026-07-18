import type { ActualServiceEndpoint } from '../value-objects/ActualServiceEndpoint'
import type { ServicePortIntent } from '../value-objects/ServicePortIntent'

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
  readonly readiness: { readonly type: 'output'; readonly text: string } | { readonly type: 'tcp' }
  readonly readinessTimeoutMs: number
  readonly port?: ServicePortIntent
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

export interface WorkflowRunFailureSnapshot {
  readonly code: string
  readonly message: string
  readonly details?: Readonly<Record<string, string | number | boolean | null>>
}

export interface WorkflowRunNodeSnapshot extends WorkflowRunPlanNodeSnapshot {
  readonly status: WorkflowRunNodeStatus
  readonly exitCode: number | null
  readonly failureReason: string | null
  readonly endpoint: ActualServiceEndpoint | null
  readonly error: WorkflowRunFailureSnapshot | null
}

export interface WorkflowRunScopeSnapshot {
  readonly projectId: string
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
}

export interface WorkflowRunSnapshot extends WorkflowRunScopeSnapshot {
  readonly id: string
  readonly graphId: string
  readonly status: WorkflowRunStatus
  readonly nodes: readonly WorkflowRunNodeSnapshot[]
}
