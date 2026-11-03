import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
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
    sessionRefSnapshot: ProviderSessionRefSnapshot | null,
    providerLaunchGeneration: number,
    executionDirectory: string | null = session.executionDirectory ?? null
  ): void {
    if (!session.shouldPersist) return
    let sessionRef
    try {
      sessionRef = sessionRefSnapshot
        ? this.providers.parseSessionRef(session.providerId, sessionRefSnapshot)
        : null
    } catch {
      transitionAgentRuntime(session, { binding: 'persistence_failed' })
      return
    }
    const lane = this.resolveLane(session, providerLaunchGeneration)
    const identity = bindingIdentity(sessionRef?.toSnapshot() ?? null, executionDirectory)
    if (lane.latestIdentity === identity) return

    lane.latestIdentity = identity
    lane.latestSessionRef = sessionRef?.toSnapshot() ?? null
    const sequence = ++lane.latestSequence
    transitionAgentRuntime(session, { binding: 'persisting' })

    const persistence = lane.tail
      .then(async () => {
        if (!isCurrentPersistence(session, providerLaunchGeneration)) return
        const persistedSession =
          (await this.repository.find(session.scope)) ??
          AgentSession.start(session.scope, session.providerId)
        if (!isCurrentPersistence(session, providerLaunchGeneration)) return
        if (sessionRef) persistedSession.bindProviderSession(session.scope, sessionRef)
        else persistedSession.clearProviderSession()
        persistedSession.setExecutionDirectory(executionDirectory)
        await this.repository.save(persistedSession)
        if (isLatestPersistence(session, lane, providerLaunchGeneration, sequence, identity)) {
          session.providerSessionRef = sessionRef?.toSnapshot() ?? null
          transitionAgentRuntime(session, { binding: sessionRef ? 'persisted' : 'unbound' })
        }
      })
      .catch(() => {
        if (isLatestPersistence(session, lane, providerLaunchGeneration, sequence, identity)) {
          // The live directory can be ahead of disk; a repeated report must retry this write.
          lane.latestIdentity = null
          transitionAgentRuntime(session, { binding: 'persistence_failed' })
        }
      })

    lane.tail = persistence
    this.pending.add(persistence)
    void persistence.finally(() => this.pending.delete(persistence))
  }

  persistDirectory(session: ManagedAgentSession, directory: string, generation: number): void {
    const lane = this.resolveLane(session, generation)
    this.persist(session, lane.latestSessionRef, generation, directory)
  }

  async waitForIdle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending])
  }

  async discardProviderSessionRef(session: ManagedAgentSession): Promise<void> {
    this.persist(session, null, session.providerLaunchGeneration)
    await this.lanes.get(session)?.tail
    if (session.runtime.binding.status === 'persistence_failed') {
      throw createExpectedAppError(
        'AGENT_SESSION_INVALID',
        'Unable to clear the missing Provider conversation reference.'
      )
    }
    session.providerSessionRef = null
    transitionAgentRuntime(session, { binding: 'unbound' })
  }

  async clear(session: ManagedAgentSession): Promise<void> {
    await this.lanes.get(session)?.tail
    if (session.shouldPersist) await this.repository.delete(session.scope)
    this.lanes.delete(session)
    session.providerSessionRef = null
    session.executionDirectory = null
    transitionAgentRuntime(session, { binding: 'unbound', executionDirectory: null })
  }

  private resolveLane(
    session: ManagedAgentSession,
    providerLaunchGeneration: number
  ): PersistenceLane {
    const existing = this.lanes.get(session)
    if (existing) {
      if (existing.providerLaunchGeneration !== providerLaunchGeneration) {
        existing.providerLaunchGeneration = providerLaunchGeneration
        existing.latestSessionRef = session.providerSessionRef
        existing.latestIdentity =
          session.runtime.binding.status === 'persistence_failed'
            ? null
            : bindingIdentity(session.providerSessionRef, session.executionDirectory ?? null)
      }
      return existing
    }

    const lane: PersistenceLane = {
      latestSessionRef: session.providerSessionRef,
      latestIdentity: bindingIdentity(
        session.providerSessionRef,
        session.executionDirectory ?? null
      ),
      latestSequence: 0,
      providerLaunchGeneration,
      tail: Promise.resolve()
    }
    this.lanes.set(session, lane)
    return lane
  }
}

interface PersistenceLane {
  latestSessionRef: ProviderSessionRefSnapshot | null
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
  identity: string | null
): boolean {
  return (
    isCurrentPersistence(session, providerLaunchGeneration) &&
    lane.providerLaunchGeneration === providerLaunchGeneration &&
    lane.latestSequence === sequence &&
    lane.latestIdentity === identity
  )
}

function bindingIdentity(
  sessionRef: ProviderSessionRefSnapshot | null,
  directory: string | null
): string {
  return JSON.stringify([sessionRef?.formatVersion, sessionRef?.kind, sessionRef?.value, directory])
}
