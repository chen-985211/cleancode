import type { TerminalWorkflowPlanScope } from '../ports/TerminalWorkflowPlanPort'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'

export interface TerminalWorkflowScopeCommand {
  readonly projectDirectory: string
  readonly workspaceId: string
}

export interface StartTerminalWorkflowCommand extends TerminalWorkflowScopeCommand {
  readonly projectId: string
  readonly workingDirectory: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly scope: TerminalWorkflowPlanScope
  readonly terminalSourceTheme?: TerminalSourceTheme
  readonly shell?: string
  readonly columns?: number
  readonly rows?: number
}
