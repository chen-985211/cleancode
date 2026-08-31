import type { AgentActivityStatus } from '../dto/AgentSessionProtocol'
import type {
  AgentActivityIdentity,
  AgentActivityInvocationSnapshot,
  AgentActivityRegistryEvent,
  AgentActivityTerminalOwner,
  AgentActivityTerminalScope,
  AgentTurnCompletedEvent,
  RecordAgentActivityCommand,
  TerminalAgentActivitySnapshot
} from '../dto/AgentActivityProtocol'

const defaultQuietWindowMs = 1_500

export interface AgentActivityScheduledTask {
  cancel(): void
}

export interface AgentActivityRegistryClock {
  now(): number
  schedule(callback: () => void, delayMs: number): AgentActivityScheduledTask
}

interface InvocationState {
  exited: boolean
  identity: AgentActivityIdentity
  sourceRevision: number
  status: AgentActivityStatus
}

interface PendingCompletion {
  completion: AgentTurnCompletedEvent
  task: AgentActivityScheduledTask | null
}

interface TerminalActivityState {
  active: boolean
  readonly exitedInvocationKeys: Set<string>
  readonly invocations: Map<string, InvocationState>
  lastOutputSequence: number
  readonly pendingCompletions: Map<string, PendingCompletion>
  revision: number
  readonly terminal: AgentActivityTerminalScope
}

export class AgentActivityRegistry {
  private readonly clock: AgentActivityRegistryClock
  private readonly listeners = new Set<(event: AgentActivityRegistryEvent) => void>()
  private readonly quietWindowMs: number
  private readonly terminalsBySlot = new Map<string, TerminalActivityState>()

  constructor(
    input: {
      readonly clock?: AgentActivityRegistryClock
      readonly quietWindowMs?: number
    } = {}
  ) {
    this.clock = input.clock ?? systemAgentActivityClock
    this.quietWindowMs = Math.max(0, input.quietWindowMs ?? defaultQuietWindowMs)
  }

  registerTerminal(terminal: AgentActivityTerminalScope): TerminalAgentActivitySnapshot | null {
    const normalizedTerminal = cloneTerminalScope(terminal)
    const slotKey = createTerminalSlotKey(normalizedTerminal)
    const existing = this.terminalsBySlot.get(slotKey)

    if (existing) {
      if (haveSameTerminalIdentity(existing.terminal, normalizedTerminal)) {
        return existing.active ? createTerminalSnapshot(existing) : null
      }
      if (normalizedTerminal.generation <= existing.terminal.generation) return null
      this.retireTerminal(existing)
    }

    const state: TerminalActivityState = {
      active: true,
      exitedInvocationKeys: new Set(),
      invocations: new Map(),
      lastOutputSequence: 0,
      pendingCompletions: new Map(),
      revision: 0,
      terminal: normalizedTerminal
    }
    this.terminalsBySlot.set(slotKey, state)
    const snapshot = createTerminalSnapshot(state)
    this.publish({ snapshot, type: 'activity_changed' })
    return snapshot
  }

  record(command: RecordAgentActivityCommand): boolean {
    if (!isSourceRevision(command.sourceRevision)) return false
    const terminal = this.findActiveTerminal(command.identity.terminal)
    if (!terminal) return false

    const invocationKey = createInvocationKey(command.identity)
    if (terminal.exitedInvocationKeys.has(invocationKey)) return false
    let invocation = terminal.invocations.get(invocationKey)
    let invocationWasCreated = false
    if (invocation?.exited) return false
    if (invocation && command.sourceRevision <= invocation.sourceRevision) return false
    if (!invocation) {
      invocation = {
        exited: false,
        identity: cloneActivityIdentity(command.identity),
        sourceRevision: -1,
        status: 'unavailable'
      }
      terminal.invocations.set(invocationKey, invocation)
      invocationWasCreated = true
    }
    invocation.sourceRevision = command.sourceRevision

    if (command.signal.type === 'status_changed') {
      this.recordStatus(terminal, invocation, command.signal.status, invocationWasCreated)
      return true
    }
    if (command.signal.type === 'turn_completed') {
      this.recordReportedCompletion(terminal, invocation, invocationWasCreated)
      return true
    }

    this.recordInvocationExit(terminal, invocation, invocationWasCreated)
    return true
  }

  recordTerminalOutput(terminal: AgentActivityTerminalScope, sequence: number): boolean {
    if (!isOutputSequence(sequence)) return false
    const current = this.findActiveTerminal(terminal)
    if (!current || sequence <= current.lastOutputSequence) return false

    current.lastOutputSequence = sequence
    for (const [invocationKey, pending] of current.pendingCompletions) {
      pending.task?.cancel()
      this.schedulePendingCompletion(current, invocationKey, pending)
    }
    return true
  }

  query(terminal: AgentActivityTerminalScope): TerminalAgentActivitySnapshot | null {
    const current = this.terminalsBySlot.get(createTerminalSlotKey(terminal))
    return current && haveSameTerminalIdentity(current.terminal, terminal)
      ? createTerminalSnapshot(current)
      : null
  }

  list(): readonly TerminalAgentActivitySnapshot[] {
    return [...this.terminalsBySlot.values()].map(createTerminalSnapshot)
  }

  subscribe(listener: (event: AgentActivityRegistryEvent) => void): () => void {
    this.listeners.add(listener)
    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false
      this.listeners.delete(listener)
    }
  }

  updateManagedAgentName(command: {
    readonly agentName: string
    readonly agentSessionId: string
    readonly terminal: AgentActivityTerminalScope
  }): boolean {
    const terminal = this.findActiveTerminal(command.terminal)
    if (!terminal) return false

    let changed = false
    for (const invocation of terminal.invocations.values()) {
      const identity = replaceManagedAgentName(invocation.identity, command)
      if (identity === invocation.identity) continue
      invocation.identity = identity
      changed = true
    }

    for (const pendingCompletion of terminal.pendingCompletions.values()) {
      const identity = replaceManagedAgentName(pendingCompletion.completion.identity, command)
      if (identity !== pendingCompletion.completion.identity) {
        pendingCompletion.completion = { ...pendingCompletion.completion, identity }
        changed = true
      }
    }

    if (changed) this.publishActivityChange(terminal)
    return changed
  }

  releaseTerminal(terminal: AgentActivityTerminalScope): boolean {
    const current = this.findActiveTerminal(terminal)
    if (!current) return false
    this.retireTerminal(current)
    return true
  }

  dispose(): void {
    for (const terminal of this.terminalsBySlot.values()) {
      cancelAllPendingCompletions(terminal)
    }
    this.terminalsBySlot.clear()
    this.listeners.clear()
  }

  private findActiveTerminal(terminal: AgentActivityTerminalScope): TerminalActivityState | null {
    const current = this.terminalsBySlot.get(createTerminalSlotKey(terminal))
    return current?.active && haveSameTerminalIdentity(current.terminal, terminal) ? current : null
  }

  private recordStatus(
    terminal: TerminalActivityState,
    invocation: InvocationState,
    status: AgentActivityStatus,
    invocationWasCreated: boolean
  ): void {
    if (isActiveStatus(status)) cancelPendingCompletion(terminal, invocation)
    const previousStatus = invocation.status
    if (previousStatus === status) {
      if (invocationWasCreated) this.publishActivityChange(terminal)
      return
    }

    invocation.status = status
    this.publishActivityChange(terminal)
    if (status === 'idle' && isActiveStatus(previousStatus)) {
      this.scheduleCompletion(terminal, invocation, 'became_idle')
    }
  }

  private recordReportedCompletion(
    terminal: TerminalActivityState,
    invocation: InvocationState,
    invocationWasCreated: boolean
  ): void {
    cancelPendingCompletion(terminal, invocation)
    if (isActiveStatus(invocation.status)) {
      invocation.status = 'idle'
      this.publishActivityChange(terminal)
    } else if (invocationWasCreated) {
      this.publishActivityChange(terminal)
    }
    this.scheduleCompletion(terminal, invocation, 'reported')
  }

  private recordInvocationExit(
    terminal: TerminalActivityState,
    invocation: InvocationState,
    invocationWasCreated: boolean
  ): void {
    invocation.exited = true
    terminal.invocations.delete(createInvocationKey(invocation.identity))
    rememberExitedInvocation(
      terminal.exitedInvocationKeys,
      createInvocationKey(invocation.identity)
    )
    invocation.status = 'unavailable'
    if (!invocationWasCreated) this.publishActivityChange(terminal)
  }

  private publishActivityChange(terminal: TerminalActivityState): void {
    terminal.revision += 1
    this.publish({ snapshot: createTerminalSnapshot(terminal), type: 'activity_changed' })
  }

  private scheduleCompletion(
    terminal: TerminalActivityState,
    invocation: InvocationState,
    reason: AgentTurnCompletedEvent['reason']
  ): void {
    const invocationKey = createInvocationKey(invocation.identity)
    cancelPendingCompletion(terminal, invocationKey)
    const completion: AgentTurnCompletedEvent = {
      completedAt: this.clock.now(),
      completionId: createCompletionId(invocation.identity, invocation.sourceRevision),
      identity: cloneActivityIdentity(invocation.identity),
      reason,
      terminalRevision: terminal.revision
    }
    const pending: PendingCompletion = { completion, task: null }
    terminal.pendingCompletions.set(invocationKey, pending)
    this.schedulePendingCompletion(terminal, invocationKey, pending)
  }

  private schedulePendingCompletion(
    terminal: TerminalActivityState,
    invocationKey: string,
    pending: PendingCompletion
  ): void {
    pending.task = this.clock.schedule(() => {
      if (!terminal.active || terminal.pendingCompletions.get(invocationKey) !== pending) return
      terminal.pendingCompletions.delete(invocationKey)
      this.publish({
        completion: { ...pending.completion, terminalRevision: terminal.revision },
        type: 'turn_completed'
      })
    }, this.quietWindowMs)
  }

  private retireTerminal(terminal: TerminalActivityState): void {
    terminal.active = false
    cancelAllPendingCompletions(terminal)
    terminal.invocations.clear()
    this.publishActivityChange(terminal)
  }

  private publish(event: AgentActivityRegistryEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event)
      } catch {
        // One projection must not prevent other Registry consumers from observing the fact.
      }
    }
  }
}

const maximumExitedInvocationTombstones = 256

function rememberExitedInvocation(tombstones: Set<string>, invocationKey: string): void {
  tombstones.delete(invocationKey)
  tombstones.add(invocationKey)
  while (tombstones.size > maximumExitedInvocationTombstones) {
    const oldest = tombstones.values().next().value as string | undefined
    if (oldest === undefined) return
    tombstones.delete(oldest)
  }
}

const systemAgentActivityClock: AgentActivityRegistryClock = {
  now: () => Date.now(),
  schedule: (callback, delayMs) => {
    const timeout = setTimeout(callback, delayMs)
    return { cancel: () => clearTimeout(timeout) }
  }
}

function cancelPendingCompletion(
  terminal: TerminalActivityState,
  invocation: InvocationState | string
): void {
  const invocationKey =
    typeof invocation === 'string' ? invocation : createInvocationKey(invocation.identity)
  terminal.pendingCompletions.get(invocationKey)?.task?.cancel()
  terminal.pendingCompletions.delete(invocationKey)
}

function cancelAllPendingCompletions(terminal: TerminalActivityState): void {
  for (const pending of terminal.pendingCompletions.values()) {
    pending.task?.cancel()
  }
  terminal.pendingCompletions.clear()
}

function createTerminalSnapshot(terminal: TerminalActivityState): TerminalAgentActivitySnapshot {
  return {
    invocations: [...terminal.invocations.values()].map(createInvocationSnapshot),
    revision: terminal.revision,
    status: terminal.active
      ? aggregateTerminalStatus(terminal.invocations.values())
      : 'unavailable',
    terminal: cloneTerminalScope(terminal.terminal)
  }
}

function createInvocationSnapshot(invocation: InvocationState): AgentActivityInvocationSnapshot {
  return {
    invocationId: invocation.identity.invocationId,
    managed: invocation.identity.managed ? { ...invocation.identity.managed } : undefined,
    providerId: invocation.identity.providerId,
    status: invocation.status
  }
}

function aggregateTerminalStatus(invocations: Iterable<InvocationState>): AgentActivityStatus {
  let aggregate: AgentActivityStatus = 'unavailable'
  for (const invocation of invocations) {
    if (activityPriority[invocation.status] > activityPriority[aggregate]) {
      aggregate = invocation.status
    }
  }
  return aggregate
}

const activityPriority: Readonly<Record<AgentActivityStatus, number>> = {
  idle: 1,
  unavailable: 0,
  waiting_approval: 4,
  waiting_input: 3,
  working: 2
}

function isActiveStatus(status: AgentActivityStatus): boolean {
  return status === 'working' || status === 'waiting_input' || status === 'waiting_approval'
}

function isOutputSequence(sequence: number): boolean {
  return Number.isSafeInteger(sequence) && sequence >= 0
}

function createTerminalSlotKey(terminal: AgentActivityTerminalScope): string {
  const owner = resolveTerminalOwner(terminal)
  return JSON.stringify([terminal.projectId, terminal.workspaceId, owner.kind, owner.id])
}

function createTerminalIdentityKey(terminal: AgentActivityTerminalScope): string {
  const owner = resolveTerminalOwner(terminal)
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

function createInvocationKey(identity: AgentActivityIdentity): string {
  return JSON.stringify([
    identity.providerId,
    identity.invocationId,
    identity.managed?.agentId ?? null,
    identity.managed?.agentSessionId ?? null,
    identity.managed?.providerLaunchGeneration ?? null
  ])
}

function createCompletionId(identity: AgentActivityIdentity, sourceRevision: number): string {
  return JSON.stringify([
    createTerminalIdentityKey(identity.terminal),
    createInvocationKey(identity),
    sourceRevision
  ])
}

function haveSameTerminalIdentity(
  left: AgentActivityTerminalScope,
  right: AgentActivityTerminalScope
): boolean {
  return createTerminalIdentityKey(left) === createTerminalIdentityKey(right)
}

function resolveTerminalOwner(terminal: AgentActivityTerminalScope): AgentActivityTerminalOwner {
  return terminal.owner ?? { id: terminal.blockId, kind: 'block' }
}

function cloneTerminalScope(terminal: AgentActivityTerminalScope): AgentActivityTerminalScope {
  return {
    ...terminal,
    owner: terminal.owner ? { ...terminal.owner } : undefined
  }
}

function cloneActivityIdentity(identity: AgentActivityIdentity): AgentActivityIdentity {
  return {
    invocationId: identity.invocationId,
    managed: identity.managed ? { ...identity.managed } : undefined,
    providerId: identity.providerId,
    terminal: cloneTerminalScope(identity.terminal)
  }
}

function replaceManagedAgentName(
  identity: AgentActivityIdentity,
  command: { readonly agentName: string; readonly agentSessionId: string }
): AgentActivityIdentity {
  const managed = identity.managed
  if (!managed || managed.agentSessionId !== command.agentSessionId) return identity
  if (managed.agentName === command.agentName) return identity
  return {
    ...identity,
    managed: { ...managed, agentName: command.agentName }
  }
}

function isSourceRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}
