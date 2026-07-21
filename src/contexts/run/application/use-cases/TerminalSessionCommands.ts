import type { TerminalSessionSnapshot } from '../dto/TerminalSessionSnapshot'
import type {
  TerminalExitEvent,
  TerminalLaunchMode,
  TerminalOutputEvent
} from '../ports/TerminalProcessPort'
import type { TerminalSessionKind } from '../../domain/aggregates/TerminalSession'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'

export interface StartTerminalSessionCommand {
  readonly projectId: string
  readonly projectDirectory: string
  readonly terminalBlockId: string
  readonly workspaceName: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly workingDirectory: string
  readonly runId?: string
  readonly shell?: string
  readonly launchCommand?: string
  readonly launchMode?: TerminalLaunchMode
  readonly sessionKind?: TerminalSessionKind
  readonly environment?: Readonly<Record<string, string>>
  readonly prepareLaunch?: (scope: TerminalRunScope) => Promise<{
    readonly launchCommand: string | undefined
    readonly environment: Readonly<Record<string, string>> | undefined
  }>
  readonly trackLifecycle?: boolean
  readonly onStartedWithinGate?: (session: TerminalSessionSnapshot) => void
  readonly columns?: number
  readonly rows?: number
  readonly onOutput: (event: TerminalOutputEvent) => void
  readonly onExit: (event: TerminalExitEvent) => void
}
