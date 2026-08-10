import type { TerminalSessionSnapshot } from '../dto/TerminalSessionSnapshot'
import type {
  TerminalExitEvent,
  TerminalLaunchMode,
  TerminalOutputEvent
} from '../ports/TerminalProcessPort'
import type {
  TerminalSessionKind,
  TerminalSourceTheme
} from '../../domain/aggregates/TerminalSession'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'
import type { TerminalOwnerRef } from '../../domain/value-objects/TerminalRunScope'
import type { TerminalViewOutputEvent } from '../ports/TerminalModelPort'

export interface TerminalViewIdentityCommand {
  readonly projectId: string
  readonly workspaceId: string
  readonly blockId: string
  readonly sessionId: string
  readonly runId: string
  readonly generation: number
  readonly viewId: string
  readonly owner?: TerminalOwnerRef
}

export interface AttachTerminalViewCommand extends TerminalViewIdentityCommand {
  readonly onOutput: (event: TerminalViewOutputEvent) => void
}

export interface StartTerminalSessionCommand {
  readonly agentActivityIntegration?: boolean
  readonly projectId: string
  readonly projectDirectory: string
  readonly terminalBlockId: string
  readonly owner?: TerminalOwnerRef
  readonly workspaceId: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly workingDirectory: string
  readonly terminalSourceTheme?: TerminalSourceTheme
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
  readonly onTitleChanged?: (title: string) => void
}
