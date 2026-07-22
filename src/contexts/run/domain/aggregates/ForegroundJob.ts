import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export type ForegroundJobStatus = 'launching' | 'running' | 'exited' | 'failed'

export interface ForegroundJobIdentity {
  readonly generation: number
  readonly launchId: string
  readonly sessionId: string
}

export interface ForegroundJobSnapshot extends ForegroundJobIdentity {
  readonly exitCode: number | null
  readonly status: ForegroundJobStatus
}

export class ForegroundJob {
  private statusValue: ForegroundJobStatus = 'launching'
  private exitCodeValue: number | null = null

  private constructor(private readonly identity: ForegroundJobIdentity) {}

  static start(identity: ForegroundJobIdentity): ForegroundJob {
    if (!identity.launchId.trim() || !identity.sessionId.trim() || identity.generation <= 0) {
      throw createExpectedAppError(
        'TERMINAL_FOREGROUND_JOB_INVALID',
        'Foreground job identity is invalid.'
      )
    }
    return new ForegroundJob({ ...identity })
  }

  get status(): ForegroundJobStatus {
    return this.statusValue
  }

  markRunning(identity: Pick<ForegroundJobIdentity, 'generation' | 'launchId'>): boolean {
    if (!this.matches(identity) || this.statusValue !== 'launching') return false
    this.statusValue = 'running'
    return true
  }

  recordExit(
    event: Pick<ForegroundJobIdentity, 'generation' | 'launchId'> & {
      readonly exitCode: number | null
    }
  ): boolean {
    if (!this.matches(event) || !['launching', 'running'].includes(this.statusValue)) return false
    this.statusValue = 'exited'
    this.exitCodeValue = event.exitCode
    return true
  }

  markFailed(): void {
    if (this.statusValue === 'launching') this.statusValue = 'failed'
  }

  toSnapshot(): ForegroundJobSnapshot {
    return {
      ...this.identity,
      exitCode: this.exitCodeValue,
      status: this.statusValue
    }
  }

  private matches(identity: Pick<ForegroundJobIdentity, 'generation' | 'launchId'>): boolean {
    return (
      identity.generation === this.identity.generation &&
      identity.launchId === this.identity.launchId
    )
  }
}
