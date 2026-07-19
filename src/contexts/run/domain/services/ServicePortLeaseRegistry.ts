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
    private readonly onSettled: (snapshot: ServicePortLeaseSnapshot) => void
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
    this.onSettled(this.toSnapshot())
  }

  quarantine(reason: string): void {
    if (this.stateValue !== 'releasing') {
      invalidLeaseTransition(this.id)
    }
    this.stateValue = 'quarantined'
    this.quarantineReasonValue = reason
    this.onSettled(this.toSnapshot())
  }

  recoverQuarantined(): void {
    this.transition('quarantined', 'released')
    this.quarantineReasonValue = null
    this.onSettled(this.toSnapshot())
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
  private readonly settlementWaiters = new Map<
    string,
    Set<(snapshot: ServicePortLeaseSnapshot) => void>
  >()

  reserve(owner: TerminalRunScope, endpoint: ActualServiceEndpoint): ServicePortLease {
    if (this.activeLeasesByPort.has(endpoint.port)) {
      throw createExpectedAppError(
        'TERMINAL_WORKFLOW_STATE_INVALID',
        'Service port already has an active lease.',
        { port: endpoint.port }
      )
    }

    const lease = new ServicePortLease(createLeaseId(), owner, endpoint, (snapshot) => {
      if (snapshot.state === 'released' && this.activeLeasesByPort.get(endpoint.port) === lease) {
        this.activeLeasesByPort.delete(endpoint.port)
      }
      this.notifySettlement(snapshot)
    })
    this.activeLeasesByPort.set(endpoint.port, lease)
    return lease
  }

  findActiveByPort(port: number): ServicePortLeaseSnapshot | null {
    return this.activeLeasesByPort.get(port)?.toSnapshot() ?? null
  }

  waitForSettlement(command: {
    readonly port: number
    readonly leaseId: string
  }): Promise<ServicePortLeaseSnapshot | null> {
    const lease = this.activeLeasesByPort.get(command.port)
    if (!lease || lease.id !== command.leaseId) return Promise.resolve(null)
    const snapshot = lease.toSnapshot()
    if (snapshot.state === 'quarantined' || snapshot.state === 'released') {
      return Promise.resolve(snapshot)
    }

    return new Promise((resolve) => {
      const waiters = this.settlementWaiters.get(command.leaseId) ?? new Set()
      waiters.add(resolve)
      this.settlementWaiters.set(command.leaseId, waiters)
    })
  }

  recoverQuarantined(command: { readonly port: number; readonly leaseId: string }): boolean {
    const lease = this.activeLeasesByPort.get(command.port)
    if (!lease || lease.id !== command.leaseId || lease.toSnapshot().state !== 'quarantined') {
      return false
    }
    lease.recoverQuarantined()
    return true
  }

  private notifySettlement(snapshot: ServicePortLeaseSnapshot): void {
    const waiters = this.settlementWaiters.get(snapshot.id)
    if (!waiters) return
    this.settlementWaiters.delete(snapshot.id)
    for (const resolve of waiters) resolve(snapshot)
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
