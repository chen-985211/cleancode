import type { ActualServiceEndpoint } from '../../domain/value-objects/ActualServiceEndpoint'
import type { TerminalSessionSnapshot } from '../dto/TerminalSessionSnapshot'
import type { TerminalLaunchPlanPort } from '../ports/TerminalLaunchPlanPort'
import type { TerminalExitEvent, TerminalOutputEvent } from '../ports/TerminalProcessPort'
import type { ManagedServiceLauncher } from '../services/ManagedServiceLauncher'
import type { TerminalSessionService } from './TerminalSessionService'
import type { TerminalSourceTheme } from '../../domain/aggregates/TerminalSession'

export interface LaunchTerminalCommand {
  readonly projectId: string
  readonly projectDirectory: string
  readonly workspaceId: string
  readonly workspaceDirectory: string
  readonly gitBranch: string | null
  readonly blockId: string
  readonly workingDirectory: string
  readonly terminalSourceTheme?: TerminalSourceTheme
  readonly shell?: string
  readonly columns?: number
  readonly rows?: number
  readonly signal: AbortSignal
  readonly onOutput: (event: TerminalOutputEvent) => void
  readonly onExit: (event: TerminalExitEvent) => void
  readonly onSessionStarted: (
    session: TerminalSessionSnapshot,
    endpoint: ActualServiceEndpoint | null
  ) => void
  readonly onEndpointConfirmed?: (
    session: TerminalSessionSnapshot,
    endpoint: ActualServiceEndpoint
  ) => void
  readonly onPortStateChanged?: (
    session: TerminalSessionSnapshot,
    endpoint: ActualServiceEndpoint,
    state: 'releasing' | 'released' | 'quarantined'
  ) => void
  readonly onRunEnded?: (event: TerminalExitEvent) => void
  readonly onCleanupFailed?: (error: unknown) => void
}

export interface LaunchTerminalCommandResult {
  readonly session: TerminalSessionSnapshot
  readonly endpoint: ActualServiceEndpoint | null
}

export class LaunchTerminalCommandUseCase {
  constructor(
    private readonly plans: TerminalLaunchPlanPort,
    private readonly sessions: TerminalSessionService,
    private readonly managedServices: ManagedServiceLauncher
  ) {}

  async execute(command: LaunchTerminalCommand): Promise<LaunchTerminalCommandResult> {
    const plan = await this.plans.getPlan({
      projectId: command.projectId,
      projectDirectory: command.projectDirectory,
      workspaceId: command.workspaceId,
      blockId: command.blockId
    })

    if (plan.executionConfig.mode === 'service' && plan.executionConfig.port) {
      const run = await this.managedServices.launch({
        projectId: command.projectId,
        projectDirectory: command.projectDirectory,
        workspaceId: command.workspaceId,
        workspaceDirectory: command.workspaceDirectory,
        gitBranch: command.gitBranch,
        blockId: command.blockId,
        workingDirectory: command.workingDirectory,
        terminalSourceTheme: command.terminalSourceTheme,
        launchCommand: plan.launchCommand,
        shell: command.shell,
        columns: command.columns,
        rows: command.rows,
        portIntent: plan.executionConfig.port,
        readiness: plan.executionConfig.readiness,
        readinessTimeoutMs: plan.executionConfig.readinessTimeoutMs,
        signal: command.signal,
        onOutput: command.onOutput,
        onExit: command.onExit,
        onSessionStarted: (session) => command.onSessionStarted(session, null),
        onEndpointConfirmed: command.onEndpointConfirmed,
        onPortStateChanged: command.onPortStateChanged,
        onCleanupFailed: command.onCleanupFailed
      })
      return { session: run.session, endpoint: run.endpoint }
    }

    const session = await this.sessions.start({
      projectId: command.projectId,
      projectDirectory: command.projectDirectory,
      workspaceId: command.workspaceId,
      workspaceDirectory: command.workspaceDirectory,
      gitBranch: command.gitBranch,
      terminalBlockId: command.blockId,
      workingDirectory: command.workingDirectory,
      terminalSourceTheme: command.terminalSourceTheme,
      launchCommand: plan.launchCommand,
      launchMode: 'interactive',
      sessionKind: 'direct',
      shell: command.shell,
      columns: command.columns,
      rows: command.rows,
      onOutput: command.onOutput,
      onExit: (event) => {
        command.onExit(event)
        command.onRunEnded?.(event)
      }
    })
    command.onSessionStarted(session, null)
    return { session, endpoint: null }
  }
}
