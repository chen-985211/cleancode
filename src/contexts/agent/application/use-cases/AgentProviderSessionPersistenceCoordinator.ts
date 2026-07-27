import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'
import { AgentSession } from '../../domain/aggregates/AgentSession'
import type { ProviderSessionRefSnapshot } from '../../domain/value-objects/ProviderSessionRef'
import { transitionAgentRuntime, type ManagedAgentSession } from './AgentSessionRuntimeState'

export class AgentProviderSessionPersistenceCoordinator {
  private readonly lanes = new WeakMap<ManagedAgentSession, PersistenceLane>()
  private readonly pending = new Set<Promise<void>>()

  constructor(
    private readonly repository: AgentSessionRepository,
    private readonly providers: AgentProviderRegistryPort
  ) {}

  persist(
    session: ManagedAgentSession,
    sessionRefSnapshot: ProviderSessionRefSnapshot,
    providerLaunchGeneration: number
  ): void {
    if (!session.shouldPersist) return
    let sessionRef
    try {
      sessionRef = this.providers.parseSessionRef(session.providerId, sessionRefSnapshot)
    } catch {
      transitionAgentRuntime(session, { binding: 'persistence_failed' })
      return
    }
    const lane = this.resolveLane(session, providerLaunchGeneration)
    const identity = providerSessionIdentity(sessionRef.toSnapshot())
    if (lane.latestIdentity === identity) return

    lane.latestIdentity = identity
    const sequence = ++lane.latestSequence
    transitionAgentRuntime(session, { binding: 'persisting' })

    const persistence = lane.tail
      .then(async () => {
        if (!isCurrentPersistence(session, providerLaunchGeneration)) return
        const persistedSession =
          (await this.repository.find(session.scope)) ??
          AgentSession.start(session.scope, session.providerId)
        if (!isCurrentPersistence(session, providerLaunchGeneration)) return
        persistedSession.bindProviderSession(session.scope, sessionRef)
        await this.repository.save(persistedSession)
        if (isLatestPersistence(session, lane, providerLaunchGeneration, sequence, identity)) {
          session.providerSessionRef = sessionRef.toSnapshot()
          transitionAgentRuntime(session, { binding: 'persisted' })
        }
      })
      .catch(() => {
        if (isLatestPersistence(session, lane, providerLaunchGeneration, sequence, identity)) {
          lane.latestIdentity = session.providerSessionRef
            ? providerSessionIdentity(session.providerSessionRef)
            : null
          transitionAgentRuntime(session, { binding: 'persistence_failed' })
        }
      })

    lane.tail = persistence
    this.pending.add(persistence)
    void persistence.finally(() => this.pending.delete(persistence))
  }

  async waitForIdle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending])
  }

  private resolveLane(
    session: ManagedAgentSession,
    providerLaunchGeneration: number
  ): PersistenceLane {
    const existing = this.lanes.get(session)
    if (existing) {
      if (existing.providerLaunchGeneration !== providerLaunchGeneration) {
        existing.providerLaunchGeneration = providerLaunchGeneration
        existing.latestIdentity = session.providerSessionRef
          ? providerSessionIdentity(session.providerSessionRef)
          : null
      }
      return existing
    }

    const lane: PersistenceLane = {
      latestIdentity: session.providerSessionRef
        ? providerSessionIdentity(session.providerSessionRef)
        : null,
      latestSequence: 0,
      providerLaunchGeneration,
      tail: Promise.resolve()
    }
    this.lanes.set(session, lane)
    return lane
  }
}

interface PersistenceLane {
  latestIdentity: string | null
  latestSequence: number
  providerLaunchGeneration: number
  tail: Promise<void>
}

function isCurrentPersistence(
  session: ManagedAgentSession,
  providerLaunchGeneration: number
): boolean {
  return session.providerLaunchGeneration === providerLaunchGeneration
}

function isLatestPersistence(
  session: ManagedAgentSession,
  lane: PersistenceLane,
  providerLaunchGeneration: number,
  sequence: number,
  identity: string
): boolean {
  return (
    isCurrentPersistence(session, providerLaunchGeneration) &&
    lane.providerLaunchGeneration === providerLaunchGeneration &&
    lane.latestSequence === sequence &&
    lane.latestIdentity === identity
  )
}

function providerSessionIdentity(sessionRef: ProviderSessionRefSnapshot): string {
  return JSON.stringify([sessionRef.formatVersion, sessionRef.kind, sessionRef.value])
}
