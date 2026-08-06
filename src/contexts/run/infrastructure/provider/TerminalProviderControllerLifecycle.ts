import { randomUUID } from 'node:crypto'
import type { Socket } from 'node:net'

import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { TerminalProviderApplicationDetachResult } from './TerminalProviderProtocol'
import type {
  ProviderControllerRelease,
  ProviderControllerReleaseReason,
  ProviderControllerState
} from './TerminalProviderServerTypes'

interface TerminalProviderControllerLifecycleOptions {
  readonly createRelease: (releaseId: string) => Promise<TerminalProviderApplicationDetachResult>
  readonly hasLiveSessions: () => boolean
  readonly isProcessAlive: (processId: number) => boolean
  readonly log?: (message: string, details?: Readonly<Record<string, unknown>>) => void
  readonly onClaim: () => void
  readonly onIdleWithoutLiveSessions: () => void
}

export class TerminalProviderControllerLifecycle {
  private stateValue: ProviderControllerState = { kind: 'unclaimed' }

  constructor(private readonly options: TerminalProviderControllerLifecycleOptions) {}

  get state(): ProviderControllerState {
    return this.stateValue
  }

  claim(
    socket: Socket,
    controllerId: string,
    processId: number
  ): {
    readonly controllerLeaseId: string
  } {
    if (!controllerId || !Number.isSafeInteger(processId) || processId <= 0) {
      throw createExpectedAppError(
        'TERMINAL_PROVIDER_AUTHENTICATION_FAILED',
        'Terminal provider controller evidence is invalid.'
      )
    }
    if (this.stateValue.kind === 'active') {
      if (this.stateValue.socket === socket && this.stateValue.controllerId === controllerId) {
        return { controllerLeaseId: this.stateValue.controllerLeaseId }
      }
      if (
        this.stateValue.socket.destroyed ||
        this.stateValue.processId === processId ||
        !this.options.isProcessAlive(this.stateValue.processId)
      ) {
        const release = this.beginRelease('unexpected-disconnect')
        if (release) this.completeAfterDisconnect(release)
      }
      throw controllerBusy()
    }
    if (this.stateValue.kind === 'releasing') throw controllerBusy()

    this.options.onClaim()
    const controllerLeaseId = randomUUID()
    this.stateValue = {
      kind: 'active',
      socket,
      controllerId,
      controllerLeaseId,
      processId
    }
    this.log('controller-claimed', { controllerId, processId })
    return { controllerLeaseId }
  }

  beginRelease(reason: ProviderControllerReleaseReason): ProviderControllerRelease | null {
    if (this.stateValue.kind === 'releasing') return this.stateValue
    if (this.stateValue.kind !== 'active') return null
    const controller = this.stateValue
    const releaseId = randomUUID()
    const release = this.options.createRelease(releaseId)
    const controllerRelease: ProviderControllerRelease = {
      socket: controller.socket,
      controllerId: controller.controllerId,
      controllerLeaseId: controller.controllerLeaseId,
      processId: controller.processId,
      reason,
      releaseId,
      release
    }
    this.stateValue = { kind: 'releasing', ...controllerRelease }
    this.log('controller-releasing', { reason, releaseId })
    void release
      .then((result) => this.log('controller-release-completed', { ...result, reason }))
      .catch((error) =>
        this.log('controller-release-failed', {
          message: getErrorMessage(error),
          reason,
          releaseId
        })
      )
    return controllerRelease
  }

  async awaitRelease(
    socket: Socket,
    releaseId: string
  ): Promise<TerminalProviderApplicationDetachResult> {
    if (
      this.stateValue.kind !== 'releasing' ||
      this.stateValue.socket !== socket ||
      this.stateValue.releaseId !== releaseId
    ) {
      throw controllerUnavailable()
    }
    const release = this.stateValue
    try {
      return await release.release
    } finally {
      this.completeRelease(release)
    }
  }

  async releaseController(reason: ProviderControllerReleaseReason): Promise<void> {
    const release = this.beginRelease(reason)
    if (!release) return
    try {
      await release.release
    } finally {
      this.completeRelease(release)
    }
  }

  handleSocketClose(socket: Socket): void {
    if (this.stateValue.kind === 'active' && this.stateValue.socket === socket) {
      const release = this.beginRelease('unexpected-disconnect')
      if (release) this.completeAfterDisconnect(release)
      return
    }
    if (this.stateValue.kind === 'releasing' && this.stateValue.socket === socket) {
      this.completeAfterDisconnect(this.stateValue)
    }
  }

  private completeAfterDisconnect(release: ProviderControllerRelease): void {
    void release.release.catch(() => undefined).finally(() => this.completeRelease(release))
  }

  private completeRelease(release: ProviderControllerRelease): void {
    if (this.stateValue.kind !== 'releasing' || this.stateValue.releaseId !== release.releaseId) {
      return
    }
    this.stateValue = { kind: 'unclaimed' }
    this.log('controller-released', {
      reason: release.reason,
      releaseId: release.releaseId
    })
    if (!this.options.hasLiveSessions()) this.options.onIdleWithoutLiveSessions()
  }

  private log(message: string, details: Readonly<Record<string, unknown>>): void {
    this.options.log?.(message, details)
  }
}

function controllerBusy() {
  return createExpectedAppError(
    'TERMINAL_PROVIDER_CONTROLLER_BUSY',
    'Terminal provider controller is active or releasing.',
    { retryAfterMs: 50 }
  )
}

function controllerUnavailable() {
  return createExpectedAppError(
    'TERMINAL_PROVIDER_UNAVAILABLE',
    'Terminal provider controller release is unavailable.'
  )
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
