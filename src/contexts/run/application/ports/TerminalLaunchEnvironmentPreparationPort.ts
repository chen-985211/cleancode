import type { TerminalSessionKind } from '../../domain/aggregates/TerminalSession'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'
import type { TerminalLaunchMode } from './TerminalProcessPort'

interface PrepareTerminalLaunchEnvironmentCommand {
  readonly environment: Readonly<Record<string, string>> | undefined
  readonly launchCommand: string | undefined
  readonly launchMode: TerminalLaunchMode | undefined
  readonly shell?: string
  readonly scope: TerminalRunScope
  readonly sessionKind: TerminalSessionKind
  readonly workingDirectory: string
}

export interface PreparedTerminalLaunchEnvironment {
  readonly environment: Readonly<Record<string, string>> | undefined
  readonly launchCommand: string | undefined
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
