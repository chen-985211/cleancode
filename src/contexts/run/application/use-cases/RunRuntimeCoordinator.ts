import { isAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { TerminalRuntimeAvailabilitySnapshot } from '../dto/TerminalRuntimeAvailability'
import type { TerminalRuntimeRecoveryResult } from '../ports/TerminalRuntimeProviderPort'
import type { RunLifecycleService } from './RunLifecycleService'

export class RunRuntimeCoordinator {
  private initialization: Promise<TerminalRuntimeRecoveryResult> | null = null
  private recovered: TerminalRuntimeRecoveryResult | null = null

  constructor(
    private readonly lifecycle: RunLifecycleService,
    private readonly recoverSessions: () => Promise<TerminalRuntimeRecoveryResult>,
    private readonly recoverManagedServices: (
      recovery: TerminalRuntimeRecoveryResult
    ) => Promise<void>
  ) {}

  initialize(): Promise<TerminalRuntimeRecoveryResult> {
    if (this.lifecycle.getRuntimeAvailability().phase === 'ready' && this.recovered) {
      return Promise.resolve(this.recovered)
    }
    if (this.initialization) return this.initialization

    this.lifecycle.beginRuntimeInitialization()
    const attempt = this.performInitialization()
    this.initialization = attempt
    void attempt.then(
      () => this.clearInitialization(attempt),
      () => this.clearInitialization(attempt)
    )
    return attempt
  }

  async retry(): Promise<TerminalRuntimeAvailabilitySnapshot> {
    try {
      await this.initialize()
    } catch {
      // The availability snapshot carries the stable retry result for the renderer.
    }
    return this.lifecycle.getRuntimeAvailability()
  }

  private async performInitialization(): Promise<TerminalRuntimeRecoveryResult> {
    try {
      const recovery = await this.recoverSessions()
      await this.recoverManagedServices(recovery)
      this.recovered = recovery
      this.lifecycle.markRuntimeReady()
      return recovery
    } catch (error) {
      const errorCode = isAppError(error) ? error.code : 'UNEXPECTED_ERROR'
      this.lifecycle.markRuntimeUnavailable(
        errorCode,
        errorCode === 'TERMINAL_PROVIDER_CONTROLLER_BUSY' ||
          errorCode === 'TERMINAL_PROVIDER_UNAVAILABLE'
      )
      throw error
    }
  }

  private clearInitialization(attempt: Promise<TerminalRuntimeRecoveryResult>): void {
    if (this.initialization === attempt) this.initialization = null
  }
}
