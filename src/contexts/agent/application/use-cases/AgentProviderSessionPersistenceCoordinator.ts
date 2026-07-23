import type { AgentSessionRepository } from '../ports/AgentSessionRepository'
import type { AgentProviderRegistryPort } from '../ports/AgentProviderRegistryPort'
import { AgentSession } from '../../domain/aggregates/AgentSession'
import type { ProviderSessionRefSnapshot } from '../../domain/value-objects/ProviderSessionRef'
import { transitionAgentRuntime, type ManagedAgentSession } from './AgentSessionRuntimeState'

export class AgentProviderSessionPersistenceCoordinator {
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
    transitionAgentRuntime(session, { binding: 'persisting' })

    const persistence = (async () => {
      if (!isCurrentPersistence(session, providerLaunchGeneration)) return
      const persistedSession =
        (await this.repository.find(session.scope)) ??
        AgentSession.start(session.scope, session.providerId)
      if (!isCurrentPersistence(session, providerLaunchGeneration)) return
      persistedSession.bindProviderSession(session.scope, sessionRef)
      await this.repository.save(persistedSession)
      if (session.providerLaunchGeneration === providerLaunchGeneration) {
        session.providerSessionRef = sessionRef.toSnapshot()
        transitionAgentRuntime(session, { binding: 'persisted' })
      }
    })().catch(() => {
      if (session.providerLaunchGeneration === providerLaunchGeneration) {
        transitionAgentRuntime(session, { binding: 'persistence_failed' })
      }
    })

    this.pending.add(persistence)
    void persistence.finally(() => this.pending.delete(persistence))
  }

  async waitForIdle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending])
  }
}

function isCurrentPersistence(
  session: ManagedAgentSession,
  providerLaunchGeneration: number
): boolean {
  return session.providerLaunchGeneration === providerLaunchGeneration && !session.isStopping
}
