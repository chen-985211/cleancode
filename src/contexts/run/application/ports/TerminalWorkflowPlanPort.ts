import type { WorkflowRunPlanSnapshot } from '../dto/WorkflowRunSnapshot'

export type TerminalWorkflowPlanScope =
  | { readonly type: 'full' }
  | { readonly type: 'from-block'; readonly blockId: string }
  | { readonly type: 'terminal-group'; readonly terminalGroupId: string }
  | { readonly type: 'block-set'; readonly blockIds: readonly string[] }

export interface BuildTerminalWorkflowPlanQuery {
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly scope: TerminalWorkflowPlanScope
}

export interface TerminalWorkflowPlanPort {
  buildPlan(query: BuildTerminalWorkflowPlanQuery): Promise<WorkflowRunPlanSnapshot>
}
