import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import type { ActualServiceEndpoint } from '../value-objects/ActualServiceEndpoint'
import type { TerminalRunScope } from '../value-objects/TerminalRunScope'

export type ServicePortLeaseState =
  'reserved' | 'activating' | 'bound' | 'releasing' | 'released' | 'quarantined'

export interface ServicePortLeaseSnapshot {
  readonly id: string
  readonly owner: TerminalRunScope
  readonly endpoint: ActualServiceEndpoint
  readonly state: ServicePortLeaseState
  readonly quarantineReason: string | null
}

export class ServicePortLease {
  private stateValue: ServicePortLeaseState = 'reserved'
  private quarantineReasonValue: string | null = null

  constructor(
    public readonly id: string,
    public readonly owner: TerminalRunScope,
    public readonly endpoint: ActualServiceEndpoint,
    private readonly onReleased: () => void
  ) {}

  markActivating(): void {
    this.transition('reserved', 'activating')
  }

  markBound(): void {
    this.transition('activating', 'bound')
  }

  markReleasing(): void {
    if (
      this.stateValue !== 'reserved' &&
      this.stateValue !== 'activating' &&
      this.stateValue !== 'bound'
    ) {
      invalidLeaseTransition(this.id)
    }
    this.stateValue = 'releasing'
  }

  release(): void {
    this.transition('releasing', 'released')
    this.onReleased()
  }

  quarantine(reason: string): void {
    if (this.stateValue !== 'releasing') {
      invalidLeaseTransition(this.id)
    }
    this.stateValue = 'quarantined'
    this.quarantineReasonValue = reason
  }

  toSnapshot(): ServicePortLeaseSnapshot {
    return {
      id: this.id,
      owner: this.owner,
      endpoint: this.endpoint,
      state: this.stateValue,
      quarantineReason: this.quarantineReasonValue
    }
  }

  private transition(expected: ServicePortLeaseState, next: ServicePortLeaseState): void {
    if (this.stateValue !== expected) {
      invalidLeaseTransition(this.id)
    }
    this.stateValue = next
  }
}

export class ServicePortLeaseRegistry {
  private readonly activeLeasesByPort = new Map<number, ServicePortLease>()

  reserve(owner: TerminalRunScope, endpoint: ActualServiceEndpoint): ServicePortLease {
    if (this.activeLeasesByPort.has(endpoint.port)) {
      throw createExpectedAppError(
        'TERMINAL_WORKFLOW_STATE_INVALID',
        'Service port already has an active lease.',
        { port: endpoint.port }
      )
    }

    const lease = new ServicePortLease(createLeaseId(), owner, endpoint, () => {
      if (this.activeLeasesByPort.get(endpoint.port) === lease) {
        this.activeLeasesByPort.delete(endpoint.port)
      }
    })
    this.activeLeasesByPort.set(endpoint.port, lease)
    return lease
  }

  findActiveByPort(port: number): ServicePortLeaseSnapshot | null {
    return this.activeLeasesByPort.get(port)?.toSnapshot() ?? null
  }
}

function invalidLeaseTransition(leaseId: string): never {
  throw createExpectedAppError(
    'TERMINAL_WORKFLOW_STATE_INVALID',
    'Service port lease transition is invalid.',
    { leaseId }
  )
}

function createLeaseId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `service-port-lease-${Date.now()}-${Math.random()}`
}
