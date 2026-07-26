import type { WorkflowRunPlanNodeSnapshot } from '../../domain/aggregates/WorkflowRunTypes'

export type TerminalLaunchPlanSnapshot = Pick<
  WorkflowRunPlanNodeSnapshot,
  'blockId' | 'launchCommand' | 'executionConfig'
>

export interface TerminalLaunchPlanPort {
  getPlan(query: {
    readonly projectId: string
    readonly projectDirectory: string
    readonly workspaceId: string
    readonly blockId: string
  }): Promise<TerminalLaunchPlanSnapshot>
}
