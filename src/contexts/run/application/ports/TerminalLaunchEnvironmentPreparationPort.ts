import type {
  TerminalSessionKind,
  TerminalSourceTheme
} from '../../domain/aggregates/TerminalSession'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'
import type { TerminalPrivateOutputControl } from '../dto/TerminalPrivateOutputControl'
import type { TerminalLaunchMode } from './TerminalProcessPort'

interface PrepareTerminalLaunchEnvironmentCommand {
  readonly environment: Readonly<Record<string, string>> | undefined
  readonly launchCommand: string | undefined
  readonly launchMode: TerminalLaunchMode | undefined
  readonly shell?: string
  readonly scope: TerminalRunScope
  readonly sessionKind: TerminalSessionKind
  readonly terminalSourceTheme: TerminalSourceTheme
  readonly workingDirectory: string
}

export interface PreparedTerminalLaunchEnvironment {
  readonly environment: Readonly<Record<string, string>> | undefined
  readonly launchCommand: string | undefined
  readonly privateOutputControl?: TerminalPrivateOutputControl
  /** Optional private shell executable selected by an explicitly enabled launch decorator. */
  readonly shell?: string
}

/**
 * Run owns the terminal launch boundary, but not the provider-specific capabilities that may
 * decorate an interactive shell. Platform supplies an adapter for explicitly opted-in sessions.
 */
export interface TerminalLaunchEnvironmentPreparationPort {
  prepare(
    command: PrepareTerminalLaunchEnvironmentCommand
  ): Promise<PreparedTerminalLaunchEnvironment>
}
