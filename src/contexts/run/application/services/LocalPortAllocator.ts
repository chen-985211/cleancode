import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type {
  ServicePortLease,
  ServicePortLeaseRegistry
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

  constructor(
    private readonly reservations: LocalPortReservationPort,
    private readonly leases: ServicePortLeaseRegistry,
    options: { readonly maxAttempts?: number } = {}
  ) {
    this.maxAttempts = options.maxAttempts ?? 3
  }

  async allocate(command: {
    readonly scope: TerminalRunScope
    readonly intent: ServicePortIntent
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
        if (command.intent.policy.type === 'fixed') {
          fixedConflict(command.intent.policy.port, command.scope, activeLease.owner)
        }
        continue
      }

      const reservation = await this.reservations.tryReserve({ host: '127.0.0.1', port })
      if (!reservation) {
        if (command.intent.policy.type === 'fixed') {
          fixedConflict(port as number, command.scope, null)
        }
        continue
      }
      lastAttemptedPort = reservation.port

      const conflictingLease = this.leases.findActiveByPort(reservation.port)
      if (conflictingLease) {
        await reservation.release()
        if (command.intent.policy.type === 'fixed') {
          fixedConflict(reservation.port, command.scope, conflictingLease.owner)
        }
        continue
      }

      const endpoint = createActualServiceEndpoint({
        protocol: command.intent.protocol,
        port: reservation.port,
        requestedPort
      })
      const lease = this.leases.reserve(command.scope, endpoint)
      return { endpoint, lease, reservation }
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
}

function fixedConflict(
  port: number,
  attemptedOwner: TerminalRunScope,
  managedOwner: TerminalRunScope | null
): never {
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
