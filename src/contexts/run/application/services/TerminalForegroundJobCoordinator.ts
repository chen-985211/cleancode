import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { TerminalSession } from '../../domain/aggregates/TerminalSession'
import { ForegroundJob, type ForegroundJobSnapshot } from '../../domain/aggregates/ForegroundJob'
import { resolveTerminalOwnerRef } from '../../domain/value-objects/TerminalRunScope'
import type { TerminalProcessPort } from '../ports/TerminalProcessPort'

export interface LaunchForegroundJobCommand {
  readonly args: readonly string[]
  readonly environment?: Readonly<Record<string, string>>
  readonly executable: string
  readonly onExit: (job: ForegroundJobSnapshot) => void
  readonly onStarted?: (job: ForegroundJobSnapshot) => void
  readonly sessionId: string
}

export class TerminalForegroundJobCoordinator {
  private readonly jobs = new Map<string, ForegroundJob>()

  constructor(
    private readonly terminalProcessPort: TerminalProcessPort,
    private readonly requireSession: (sessionId: string) => TerminalSession
  ) {}

  launch(command: LaunchForegroundJobCommand): ForegroundJobSnapshot {
    const session = this.requireSession(command.sessionId)
    if (session.status !== 'running') {
      throw createExpectedAppError(
        'TERMINAL_SESSION_NOT_RUNNING',
        'Terminal session is not running.'
      )
    }
    if (resolveTerminalOwnerRef(session.scope).kind !== 'agent') {
      throw createExpectedAppError(
        'RUN_START_BLOCKED',
        'Foreground Agent jobs require an Agent-owned terminal.'
      )
    }
    const launch = this.terminalProcessPort.launchForegroundJob
    if (!launch) {
      throw createExpectedAppError(
        'TERMINAL_PROVIDER_PROTOCOL_UNSUPPORTED',
        'Terminal runtime does not support foreground jobs.'
      )
    }
    const previous = this.jobs.get(session.id)
    if (previous && (previous.status === 'launching' || previous.status === 'running')) {
      throw createExpectedAppError(
        'TERMINAL_PROVIDER_CONTROLLER_BUSY',
        'A foreground job is already active in this Agent terminal.'
      )
    }
    const generation = (previous?.toSnapshot().generation ?? 0) + 1
    const job = ForegroundJob.start({
      generation,
      launchId: createLaunchId(),
      sessionId: session.id
    })
    this.jobs.set(session.id, job)
    const identity = job.toSnapshot()
    try {
      launch.call(this.terminalProcessPort, {
        args: command.args,
        environment: command.environment ?? {},
        executable: command.executable,
        generation,
        launchId: identity.launchId,
        onExit: (event) => {
          if (this.jobs.get(session.id) !== job || !job.recordExit(event)) return
          command.onExit(job.toSnapshot())
        },
        onStarted: (event) => {
          if (this.jobs.get(session.id) !== job || !job.markRunning(event)) return
          command.onStarted?.(job.toSnapshot())
        },
        sessionId: session.id
      })
    } catch (error) {
      job.markFailed()
      throw error
    }
    return job.toSnapshot()
  }

  get(sessionId: string): ForegroundJobSnapshot | null {
    return this.jobs.get(sessionId)?.toSnapshot() ?? null
  }

  forget(sessionId: string): void {
    this.jobs.delete(sessionId)
  }

  clear(): void {
    this.jobs.clear()
  }
}

function createLaunchId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `agent-launch-${Date.now()}-${Math.random()}`
}
