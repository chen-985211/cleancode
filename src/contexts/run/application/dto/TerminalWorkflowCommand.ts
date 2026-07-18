import type { TerminalWorkflowPlanScope } from '../ports/TerminalWorkflowPlanPort'

export interface TerminalWorkflowScopeCommand {
  readonly projectDirectory: string
  readonly workspaceName: string
}

export interface StartTerminalWorkflowCommand extends TerminalWorkflowScopeCommand {
  readonly projectId: string
  readonly workingDirectory: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly scope: TerminalWorkflowPlanScope
  readonly shell?: string
  readonly columns?: number
  readonly rows?: number
}
