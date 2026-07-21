import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  ServicePortLease,
  ServicePortLeaseRegistry,
  ServicePortLeaseSnapshot
} from '../../domain/services/ServicePortLeaseRegistry'
import {
  createActualServiceEndpoint,
  type ActualServiceEndpoint
} from '../../domain/value-objects/ActualServiceEndpoint'
import type { ServicePortIntent } from '../../domain/value-objects/ServicePortIntent'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'
import type {
  LocalPortReservation,
  LocalPortReservationPort
} from '../ports/LocalPortReservationPort'
import { createRunAttemptDetails } from './RunFailureDetails'

export interface LocalPortAllocation {
  readonly endpoint: ActualServiceEndpoint
  readonly lease: ServicePortLease
  readonly reservation: LocalPortReservation
}

export class LocalPortAllocator {
  private readonly maxAttempts: number
  private readonly releaseWaitTimeoutMs: number
  private readonly isRunInactive: (scope: TerminalRunScope) => boolean

  constructor(
    private readonly reservations: LocalPortReservationPort,
    private readonly leases: ServicePortLeaseRegistry,
    options: {
      readonly maxAttempts?: number
      readonly releaseWaitTimeoutMs?: number
      readonly isRunInactive?: (scope: TerminalRunScope) => boolean
    } = {}
  ) {
    this.maxAttempts = options.maxAttempts ?? 3
    this.releaseWaitTimeoutMs = options.releaseWaitTimeoutMs ?? 2_500
    this.isRunInactive = options.isRunInactive ?? (() => false)
  }

  async allocate(command: {
    readonly scope: TerminalRunScope
    readonly intent: ServicePortIntent
    readonly signal?: AbortSignal
  }): Promise<LocalPortAllocation> {
    const requestedPort = 'port' in command.intent.policy ? command.intent.policy.port : null
    let lastAttemptedPort = requestedPort ?? 0

    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      const port =
        command.intent.policy.type === 'fixed' ||
        (command.intent.policy.type === 'preferred' && attempt === 0)
          ? command.intent.policy.port
          : undefined
      lastAttemptedPort = port ?? lastAttemptedPort
      const activeLease = port === undefined ? null : this.leases.findActiveByPort(port)

      if (activeLease) {
        if (activeLease.state === 'releasing') {
          const settled = await this.waitForSettlement(activeLease, command.signal)
          if (settled || !this.isExactActiveLease(activeLease)) attempt -= 1
          else if (command.intent.policy.type === 'fixed') {
            fixedConflict(command.intent.policy.port, command.scope, activeLease)
          }
          continue
        }
        if (activeLease.state !== 'quarantined' || !this.isRunInactive(activeLease.owner)) {
          if (command.intent.policy.type === 'fixed') {
            fixedConflict(command.intent.policy.port, command.scope, activeLease)
          }
          continue
        }
      }

      const reservation = await this.reservations.tryReserve({ host: '127.0.0.1', port })
      if (!reservation) {
        if (command.intent.policy.type === 'fixed') {
          fixedConflict(port as number, command.scope, activeLease)
        }
        continue
      }
      lastAttemptedPort = reservation.port

      const conflictingLease = this.leases.findActiveByPort(reservation.port)
      if (conflictingLease) {
        if (
          conflictingLease.state === 'quarantined' &&
          this.isRunInactive(conflictingLease.owner) &&
          this.leases.recoverQuarantined({
            port: reservation.port,
            leaseId: conflictingLease.id
          })
        ) {
          return this.createAllocation(command, requestedPort, reservation)
        }
        await reservation.release()
        if (conflictingLease.state === 'releasing') {
          const settled = await this.waitForSettlement(conflictingLease, command.signal)
          if (settled || !this.isExactActiveLease(conflictingLease)) attempt -= 1
          else if (command.intent.policy.type === 'fixed') {
            fixedConflict(reservation.port, command.scope, conflictingLease)
          }
          continue
        }
        if (command.intent.policy.type === 'fixed') {
          fixedConflict(reservation.port, command.scope, conflictingLease)
        }
        continue
      }

      return this.createAllocation(command, requestedPort, reservation)
    }

    throw createExpectedAppError(
      'SERVICE_PORT_ALLOCATION_EXHAUSTED',
      'Unable to allocate a local service port after bounded attempts.',
      {
        attempts: this.maxAttempts,
        ...createRunAttemptDetails(command.scope, lastAttemptedPort)
      }
    )
  }

  adoptBound(scope: TerminalRunScope, endpoint: ActualServiceEndpoint): LocalPortAllocation {
    const lease = this.leases.adoptBound(scope, endpoint)
    return {
      endpoint,
      lease,
      reservation: {
        host: endpoint.host,
        port: endpoint.port,
        release: () => Promise.resolve()
      }
    }
  }

  private createAllocation(
    command: { readonly scope: TerminalRunScope; readonly intent: ServicePortIntent },
    requestedPort: number | null,
    reservation: LocalPortReservation
  ): LocalPortAllocation {
    const endpoint = createActualServiceEndpoint({
      protocol: command.intent.protocol,
      port: reservation.port,
      requestedPort
    })
    const lease = this.leases.reserve(command.scope, endpoint)
    return { endpoint, lease, reservation }
  }

  private async waitForSettlement(
    lease: ServicePortLeaseSnapshot,
    signal?: AbortSignal
  ): Promise<ServicePortLeaseSnapshot | null> {
    if (signal?.aborted) throw signal.reason
    const waiting = this.leases.waitForSettlement({ port: lease.endpoint.port, leaseId: lease.id })
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let abortListener: (() => void) | undefined
    const interrupted = new Promise<null>((resolve, reject) => {
      timeoutId = setTimeout(resolve, this.releaseWaitTimeoutMs, null)
      if (signal) {
        abortListener = () => reject(signal.reason)
        signal.addEventListener('abort', abortListener, { once: true })
      }
    })
    try {
      return await Promise.race([waiting, interrupted])
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
      if (signal && abortListener) signal.removeEventListener('abort', abortListener)
    }
  }

  private isExactActiveLease(lease: ServicePortLeaseSnapshot): boolean {
    return this.leases.findActiveByPort(lease.endpoint.port)?.id === lease.id
  }
}

function fixedConflict(
  port: number,
  attemptedOwner: TerminalRunScope,
  managedLease: ServicePortLeaseSnapshot | null
): never {
  const managedOwner = managedLease?.owner ?? null
  throw createExpectedAppError(
    'SERVICE_PORT_FIXED_CONFLICT',
    'The fixed local service port is already occupied.',
    {
      port,
      attemptedProjectId: attemptedOwner.projectId,
      attemptedProjectDirectory: attemptedOwner.projectDirectory,
      attemptedWorkspaceName: attemptedOwner.workspaceName,
      attemptedWorkspaceDirectory: attemptedOwner.workspaceDirectory,
      attemptedGitBranch: attemptedOwner.gitBranch,
      attemptedBlockId: attemptedOwner.blockId,
      attemptedSessionId: attemptedOwner.sessionId,
      attemptedRunId: attemptedOwner.runId,
      attemptedGeneration: attemptedOwner.generation,
      managedLeaseState: managedLease?.state ?? null,
      managedProjectId: managedOwner?.projectId ?? null,
      managedProjectDirectory: managedOwner?.projectDirectory ?? null,
      managedWorkspaceName: managedOwner?.workspaceName ?? null,
      managedWorkspaceDirectory: managedOwner?.workspaceDirectory ?? null,
      managedGitBranch: managedOwner?.gitBranch ?? null,
      managedBlockId: managedOwner?.blockId ?? null,
      managedSessionId: managedOwner?.sessionId ?? null,
      managedRunId: managedOwner?.runId ?? null,
      managedGeneration: managedOwner?.generation ?? null
    }
  )
}
