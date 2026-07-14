import type { WorkflowRunPlanSnapshot } from '../dto/WorkflowRunSnapshot'

export type TerminalWorkflowPlanScope =
  { readonly type: 'full' } | { readonly type: 'from-block'; readonly blockId: string }

export interface BuildTerminalWorkflowPlanQuery {
  readonly projectDirectory: string
  readonly workspaceName: string
  readonly scope: TerminalWorkflowPlanScope
}

export interface TerminalWorkflowPlanPort {
  buildPlan(query: BuildTerminalWorkflowPlanQuery): Promise<WorkflowRunPlanSnapshot>
}
