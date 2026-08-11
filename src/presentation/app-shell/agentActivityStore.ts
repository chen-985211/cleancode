import type {
  AgentActivityTerminalScope,
  AgentTurnCompletedEvent,
  TerminalAgentActivitySnapshot
} from '../../contexts/agent/application/dto/AgentActivityProtocol'
import type { AppNotificationIdentity } from './appNotifications'
import {
  createCanvasObjectIdentity,
  type CanvasObjectIdentity
} from '../../shared-kernel/domain/value-objects/CanvasObjectIdentity'

export type AgentActivityNotificationProjection =
  | {
      readonly messageIdentity: AppNotificationIdentity
      readonly source: AgentActivityNotificationSource
      readonly status: 'waiting_approval' | 'waiting_input'
      readonly type: 'attention'
    }
  | {
      readonly messageKey: string
      readonly type: 'attention_resolved'
    }
  | {
      readonly messageIdentity: AppNotificationIdentity
      readonly source: AgentActivityNotificationSource
      readonly type: 'turn_completed'
    }

interface AgentActivityNotificationSource {
  readonly agentName?: string
  readonly gitBranch: string | null
  readonly projectDirectory: string
  readonly projectId: string
  readonly providerId: string
  readonly target: CanvasObjectIdentity
  readonly workspaceDirectory: string
  readonly workspaceId: string
}

const completedIdentityHistoryLimit = 1_024
const inactiveSnapshotHistoryLimit = 256

export class AgentActivityStore {
  private readonly attentionOccurrencesBySlot = new Map<
    string,
    { readonly occurrenceId: string; readonly status: 'waiting_approval' | 'waiting_input' }
  >()
  private readonly completedIds = new Set<string>()
  private readonly listeners = new Set<() => void>()
  private readonly snapshotsBySlot = new Map<string, TerminalAgentActivitySnapshot>()
  private snapshots: readonly TerminalAgentActivitySnapshot[] = []

  readonly getSnapshots = (): readonly TerminalAgentActivitySnapshot[] => this.snapshots

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  establishBaseline(snapshots: readonly TerminalAgentActivitySnapshot[]): void {
    this.attentionOccurrencesBySlot.clear()
    this.snapshotsBySlot.clear()
    for (const snapshot of snapshots) {
      const slotKey = createTerminalSlotKey(snapshot.terminal)
      const current = this.snapshotsBySlot.get(slotKey)
      if (!current || shouldAcceptSnapshot(current, snapshot)) {
        this.snapshotsBySlot.set(slotKey, snapshot)
      }
    }
    this.publishSnapshots()
  }

  recordActivity(
    snapshot: TerminalAgentActivitySnapshot
  ): AgentActivityNotificationProjection | null {
    const slotKey = createTerminalSlotKey(snapshot.terminal)
    const current = this.snapshotsBySlot.get(slotKey)
    if (current && !shouldAcceptSnapshot(current, snapshot)) return null

    this.snapshotsBySlot.set(slotKey, snapshot)
    this.publishSnapshots()

    if (!isAttentionStatus(snapshot.status)) {
      this.attentionOccurrencesBySlot.delete(slotKey)
      return current && isAttentionStatus(current.status)
        ? { messageKey: createAttentionNotificationKey(slotKey), type: 'attention_resolved' }
        : null
    }
    if (
      current &&
      haveSameTerminalIdentity(current.terminal, snapshot.terminal) &&
      current.status === snapshot.status
    ) {
      const occurrence = this.attentionOccurrencesBySlot.get(slotKey)
      return occurrence?.status === snapshot.status
        ? createAttentionProjection(snapshot, slotKey, occurrence.occurrenceId, snapshot.status)
        : null
    }

    const occurrenceId = createAttentionOccurrenceId(snapshot)
    this.attentionOccurrencesBySlot.set(slotKey, { occurrenceId, status: snapshot.status })
    return createAttentionProjection(snapshot, slotKey, occurrenceId, snapshot.status)
  }

  recordLiveActivity(
    snapshot: TerminalAgentActivitySnapshot
  ): AgentActivityNotificationProjection | null {
    const slotKey = createTerminalSlotKey(snapshot.terminal)
    const current = this.snapshotsBySlot.get(slotKey)
    if (!current || shouldAcceptSnapshot(current, snapshot)) return this.recordActivity(snapshot)
    if (
      !haveSameTerminalIdentity(current.terminal, snapshot.terminal) ||
      current.revision !== snapshot.revision ||
      current.status !== snapshot.status ||
      !isAttentionStatus(snapshot.status)
    ) {
      return null
    }

    const existing = this.attentionOccurrencesBySlot.get(slotKey)
    const occurrenceId =
      existing?.status === snapshot.status
        ? existing.occurrenceId
        : createAttentionOccurrenceId(snapshot)
    this.attentionOccurrencesBySlot.set(slotKey, { occurrenceId, status: snapshot.status })
    return createAttentionProjection(snapshot, slotKey, occurrenceId, snapshot.status)
  }

  recordCompletion(
    completion: AgentTurnCompletedEvent
  ): AgentActivityNotificationProjection | null {
    if (this.completedIds.has(completion.completionId)) return null
    rememberBoundedIdentity(
      this.completedIds,
      completion.completionId,
      completedIdentityHistoryLimit
    )

    const slotKey = createTerminalSlotKey(completion.identity.terminal)
    const current = this.snapshotsBySlot.get(slotKey)
    if (current && isCompletionStale(current, completion)) return null

    return {
      messageIdentity: {
        key: createCompletionNotificationKey(completion.identity),
        occurrenceId: completion.completionId,
        revision: completion.terminalRevision
      },
      source: createIdentitySource(completion.identity),
      type: 'turn_completed'
    }
  }

  private publishSnapshots(): void {
    pruneInactiveSnapshots(this.snapshotsBySlot)
    this.snapshots = [...this.snapshotsBySlot.values()]
    for (const listener of this.listeners) listener()
  }
}

function createAttentionProjection(
  snapshot: TerminalAgentActivitySnapshot,
  slotKey: string,
  occurrenceId: string,
  status: 'waiting_approval' | 'waiting_input'
): Extract<AgentActivityNotificationProjection, { type: 'attention' }> {
  return {
    messageIdentity: {
      key: createAttentionNotificationKey(slotKey),
      occurrenceId,
      revision: snapshot.revision
    },
    source: createSnapshotSource(snapshot),
    status,
    type: 'attention'
  }
}

function createAttentionOccurrenceId(snapshot: TerminalAgentActivitySnapshot): string {
  return JSON.stringify([
    'status',
    createTerminalIdentityKey(snapshot.terminal),
    snapshot.status,
    snapshot.revision
  ])
}

function createSnapshotSource(
  snapshot: TerminalAgentActivitySnapshot
): AgentActivityNotificationSource {
  const invocation =
    snapshot.invocations.find((candidate) => candidate.status === snapshot.status) ??
    snapshot.invocations[0]
  return {
    ...(invocation?.managed?.agentName ? { agentName: invocation.managed.agentName } : {}),
    gitBranch: snapshot.terminal.gitBranch,
    projectDirectory: snapshot.terminal.projectDirectory,
    projectId: snapshot.terminal.projectId,
    providerId: invocation?.providerId ?? 'agent',
    target: resolveNavigationTarget(snapshot.terminal),
    workspaceDirectory: snapshot.terminal.workspaceDirectory,
    workspaceId: snapshot.terminal.workspaceId
  }
}

function createIdentitySource(
  identity: AgentTurnCompletedEvent['identity']
): AgentActivityNotificationSource {
  return {
    ...(identity.managed?.agentName ? { agentName: identity.managed.agentName } : {}),
    gitBranch: identity.terminal.gitBranch,
    projectDirectory: identity.terminal.projectDirectory,
    projectId: identity.terminal.projectId,
    providerId: identity.providerId,
    target: resolveNavigationTarget(identity.terminal),
    workspaceDirectory: identity.terminal.workspaceDirectory,
    workspaceId: identity.terminal.workspaceId
  }
}

function resolveNavigationTarget(terminal: AgentActivityTerminalScope): CanvasObjectIdentity {
  const owner = terminal.owner ?? { id: terminal.blockId, kind: 'block' }
  return createCanvasObjectIdentity({
    objectId: owner.id,
    objectKind: owner.kind === 'agent' ? 'agent' : 'terminal',
    projectId: terminal.projectId,
    workspaceId: terminal.workspaceId
  })
}

function rememberBoundedIdentity(identities: Set<string>, identity: string, limit: number): void {
  identities.delete(identity)
  identities.add(identity)
  while (identities.size > limit) {
    const oldest = identities.values().next().value as string | undefined
    if (oldest === undefined) return
    identities.delete(oldest)
  }
}

function pruneInactiveSnapshots(snapshotsBySlot: Map<string, TerminalAgentActivitySnapshot>): void {
  if (snapshotsBySlot.size <= inactiveSnapshotHistoryLimit) return
  for (const [slotKey, snapshot] of snapshotsBySlot) {
    if (snapshotsBySlot.size <= inactiveSnapshotHistoryLimit) return
    if (snapshot.status === 'unavailable') snapshotsBySlot.delete(slotKey)
  }
}

function shouldAcceptSnapshot(
  current: TerminalAgentActivitySnapshot,
  incoming: TerminalAgentActivitySnapshot
): boolean {
  if (haveSameTerminalIdentity(current.terminal, incoming.terminal)) {
    return incoming.revision > current.revision
  }
  return incoming.terminal.generation > current.terminal.generation
}

function isCompletionStale(
  current: TerminalAgentActivitySnapshot,
  completion: AgentTurnCompletedEvent
): boolean {
  if (haveSameTerminalIdentity(current.terminal, completion.identity.terminal)) {
    return false
  }
  return completion.identity.terminal.generation <= current.terminal.generation
}

function isAttentionStatus(
  status: TerminalAgentActivitySnapshot['status']
): status is 'waiting_approval' | 'waiting_input' {
  return status === 'waiting_approval' || status === 'waiting_input'
}

function createAttentionNotificationKey(slotKey: string): string {
  return `agent-activity:attention:${slotKey}`
}

function createCompletionNotificationKey(identity: AgentTurnCompletedEvent['identity']): string {
  return `agent-activity:completion:${JSON.stringify([
    createTerminalIdentityKey(identity.terminal),
    identity.providerId,
    identity.invocationId,
    identity.managed?.agentId ?? null,
    identity.managed?.agentSessionId ?? null,
    identity.managed?.providerLaunchGeneration ?? null
  ])}`
}

function createTerminalSlotKey(terminal: AgentActivityTerminalScope): string {
  const owner = terminal.owner ?? { id: terminal.blockId, kind: 'block' }
  return JSON.stringify([terminal.projectId, terminal.workspaceId, owner.kind, owner.id])
}

function createTerminalIdentityKey(terminal: AgentActivityTerminalScope): string {
  const owner = terminal.owner ?? { id: terminal.blockId, kind: 'block' }
  return JSON.stringify([
    terminal.projectId,
    terminal.projectDirectory,
    terminal.workspaceId,
    terminal.workspaceDirectory,
    terminal.gitBranch,
    terminal.blockId,
    owner.kind,
    owner.id,
    terminal.sessionId,
    terminal.runId,
    terminal.generation
  ])
}

function haveSameTerminalIdentity(
  left: AgentActivityTerminalScope,
  right: AgentActivityTerminalScope
): boolean {
  return createTerminalIdentityKey(left) === createTerminalIdentityKey(right)
}
