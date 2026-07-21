import type { AppErrorCode } from '../../../../shared-kernel/application/errors/AppError'

export type TerminalRuntimePhase = 'initializing' | 'ready' | 'unavailable' | 'shutting-down'

export interface TerminalRuntimeAvailabilitySnapshot {
  readonly phase: TerminalRuntimePhase
  readonly epoch: number
  readonly errorCode: AppErrorCode | null
  readonly retryable: boolean
}
