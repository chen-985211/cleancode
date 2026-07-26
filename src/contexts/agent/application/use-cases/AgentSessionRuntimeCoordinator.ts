import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import { createCanvasObjectIdentityKey } from '../../../../shared-kernel/domain/value-objects/CanvasObjectIdentity'

export interface AgentSessionRuntimeOwner {
  readonly agentId: string
  readonly projectDirectory: string
  readonly projectId: string
  readonly workspaceDirectory: string
  readonly workspaceId: string
}

export interface AgentRuntimeAttachmentLease {
  readonly wasQuarantined: boolean
  quarantine(): void
  release(): void
  resolve(): void
}

export interface AgentRuntimeSuspensionLease extends AgentRuntimeAttachmentLease {
  readonly wasSuspended: boolean
  resume(): Promise<void>
}

type OwnerPredicate = (owner: AgentSessionRuntimeOwner) => boolean

export class AgentSessionRuntimeCoordinator {
  private readonly blockers = new Set<OwnerPredicate>()
  private readonly lifecycleLeaseReleases = new Set<() => void>()
  private readonly lifecycleLeaseTails = new Map<string, Promise<void>>()
  private readonly quarantinedBlockers = new Map<string, Set<() => void>>()
  private readonly knownOwners = new Map<string, AgentSessionRuntimeOwner>()
  private readonly operationTails = new Map<string, Promise<void>>()
  private isStopped = false

  runAttach<T>(owner: AgentSessionRuntimeOwner, operation: () => Promise<T>): Promise<T> {
    if (this.isStopped || [...this.blockers].some((blocker) => blocker(owner))) {
      return Promise.reject(
        createExpectedAppError(
          'AGENT_SESSION_NOT_FOUND',
          'Agent session lifecycle changed before attachment completed.'
        )
      )
    }

    return this.enqueue(owner, operation)
  }

  runLifecycle<T>(owner: AgentSessionRuntimeOwner, operation: () => Promise<T>): Promise<T> {
    if (this.isStopped) {
      return Promise.reject(
        createExpectedAppError('AGENT_SESSION_NOT_FOUND', 'Agent session service is shutting down.')
      )
    }

    return this.enqueue(owner, operation)
  }

  runForOwners<T>(
    predicate: OwnerPredicate,
    operation: (owner: AgentSessionRuntimeOwner) => Promise<T>
  ): Promise<readonly T[]> {
    return Promise.all(
      this.findOwners(predicate).map((owner) => this.runLifecycle(owner, () => operation(owner)))
    )
  }

  runStartForOwners<T>(
    predicate: OwnerPredicate,
    operation: (owner: AgentSessionRuntimeOwner) => Promise<T>
  ): Promise<readonly T[]> {
    return Promise.all(
      this.findOwners(predicate).map((owner) => this.runAttach(owner, () => operation(owner)))
    )
  }

  isQuarantined(key: string, prefix = false): boolean {
    return this.hasQuarantinedBlocker(key, prefix)
  }

  resolveQuarantines(key: string, prefix = false): void {
    this.releaseQuarantinedBlockers(key, prefix)
  }

  isWorkspaceQuarantined(projectDirectory: string, workspaceId: string): boolean {
    return this.isQuarantined(`project:${projectDirectory}\0workspace:${workspaceId}`)
  }

  resolveProjectQuarantines(projectDirectory: string): void {
    this.resolveQuarantines(`project:${projectDirectory}\0`, true)
  }

  blockAttaches(predicate: OwnerPredicate): () => void {
    if (this.isStopped) {
      throw createExpectedAppError(
        'AGENT_SESSION_NOT_FOUND',
        'Agent session service is shutting down.'
      )
    }

    this.blockers.add(predicate)
    let isActive = true
    return () => {
      if (!isActive) return
      isActive = false
      this.blockers.delete(predicate)
    }
  }

  async acquireAttachmentLease(
    lockKey: string,
    quarantineKey: string,
    resolvesQuarantinePrefix: boolean,
    predicate: OwnerPredicate
  ): Promise<AgentRuntimeAttachmentLease> {
    const unblockAttaches = this.blockAttaches(predicate)
    const previousLease = this.lifecycleLeaseTails.get(lockKey) ?? Promise.resolve()
    let resolveLease: () => void = () => undefined
    const currentLease = new Promise<void>((resolve) => {
      resolveLease = resolve
    })
    let isHeld = true
    const finishLease = (): void => {
      if (!isHeld) return
      isHeld = false
      this.lifecycleLeaseReleases.delete(finishLease)
      resolveLease()
    }
    const leaseTail = previousLease.then(() => currentLease)
    this.lifecycleLeaseReleases.add(finishLease)
    this.lifecycleLeaseTails.set(lockKey, leaseTail)
    void leaseTail.finally(() => {
      if (this.lifecycleLeaseTails.get(lockKey) === leaseTail) {
        this.lifecycleLeaseTails.delete(lockKey)
      }
    })

    await previousLease
    if (this.isStopped) {
      unblockAttaches()
      finishLease()
      throw createExpectedAppError(
        'AGENT_SESSION_NOT_FOUND',
        'Agent session service is shutting down.'
      )
    }

    const wasQuarantined = this.hasQuarantinedBlocker(quarantineKey, resolvesQuarantinePrefix)
    let isActive = true
    return {
      wasQuarantined,
      quarantine: () => {
        if (!isActive) return
        isActive = false
        const quarantined = this.quarantinedBlockers.get(quarantineKey) ?? new Set()
        quarantined.add(unblockAttaches)
        this.quarantinedBlockers.set(quarantineKey, quarantined)
        finishLease()
      },
      release: () => {
        if (!isActive) return
        isActive = false
        unblockAttaches()
        finishLease()
      },
      resolve: () => {
        if (!isActive) return
        isActive = false
        unblockAttaches()
        this.releaseQuarantinedBlockers(quarantineKey, resolvesQuarantinePrefix)
        finishLease()
      }
    }
  }

  acquireDirectoryLease(
    workspaceDirectory: string,
    predicate: OwnerPredicate
  ): Promise<AgentRuntimeAttachmentLease> {
    return this.acquireAttachmentLease(
      `project:${workspaceDirectory}`,
      `project:${workspaceDirectory}\0directory:${workspaceDirectory}`,
      false,
      predicate
    )
  }

  runWithWorkspaceLease(
    projectDirectory: string,
    workspaceId: string,
    predicate: OwnerPredicate,
    operation: (owner: AgentSessionRuntimeOwner) => Promise<void>
  ): Promise<AgentRuntimeAttachmentLease> {
    return this.runWithAttachmentLease(
      `project:${projectDirectory}`,
      `project:${projectDirectory}\0workspace:${workspaceId}`,
      false,
      predicate,
      operation
    )
  }

  runWithAgentLease(
    projectId: string,
    workspaceId: string,
    agentId: string,
    predicate: OwnerPredicate,
    operation: (owner: AgentSessionRuntimeOwner) => Promise<void>
  ): Promise<AgentRuntimeAttachmentLease> {
    return this.runWithAttachmentLease(
      `project-id:${projectId}`,
      `project-id:${projectId}\0agent:${workspaceId}:${agentId}`,
      false,
      predicate,
      operation
    )
  }

  runWithProjectLease(
    projectDirectory: string,
    predicate: OwnerPredicate,
    operation: (owner: AgentSessionRuntimeOwner) => Promise<void>
  ): Promise<AgentRuntimeAttachmentLease> {
    return this.runWithAttachmentLease(
      `project:${projectDirectory}`,
      `project:${projectDirectory}\0`,
      true,
      predicate,
      operation
    )
  }

  stop(): void {
    this.isStopped = true
    this.blockers.clear()
    this.quarantinedBlockers.clear()
    for (const release of [...this.lifecycleLeaseReleases]) release()
  }

  async waitForIdle(): Promise<void> {
    while (this.operationTails.size > 0) {
      await Promise.all([...this.operationTails.values()])
    }
  }

  clear(): void {
    this.lifecycleLeaseReleases.clear()
    this.lifecycleLeaseTails.clear()
    this.quarantinedBlockers.clear()
    this.knownOwners.clear()
    this.operationTails.clear()
  }

  private findOwners(predicate: OwnerPredicate): readonly AgentSessionRuntimeOwner[] {
    return [...this.knownOwners.values()].filter(predicate)
  }

  private hasQuarantinedBlocker(key: string, prefix: boolean): boolean {
    return [...this.quarantinedBlockers.keys()].some((candidate) =>
      prefix ? candidate.startsWith(key) : candidate === key
    )
  }

  private releaseQuarantinedBlockers(key: string, prefix: boolean): void {
    for (const [candidate, releases] of this.quarantinedBlockers.entries()) {
      if (prefix ? candidate.startsWith(key) : candidate === key) {
        for (const release of releases) release()
        this.quarantinedBlockers.delete(candidate)
      }
    }
  }

  private async runWithAttachmentLease(
    lockKey: string,
    quarantineKey: string,
    resolvesQuarantinePrefix: boolean,
    predicate: OwnerPredicate,
    operation: (owner: AgentSessionRuntimeOwner) => Promise<void>
  ): Promise<AgentRuntimeAttachmentLease> {
    const lease = await this.acquireAttachmentLease(
      lockKey,
      quarantineKey,
      resolvesQuarantinePrefix,
      predicate
    )
    try {
      await this.runForOwners(predicate, operation)
      return lease
    } catch (error) {
      lease.release()
      throw error
    }
  }

  private enqueue<T>(owner: AgentSessionRuntimeOwner, operation: () => Promise<T>): Promise<T> {
    const ownerKey = createAgentSessionRuntimeOwnerKey(owner)
    this.knownOwners.set(ownerKey, owner)
    const previousOperation = this.operationTails.get(ownerKey) ?? Promise.resolve()
    const result = previousOperation.catch(() => undefined).then(operation)
    const operationTail = result.then(
      () => undefined,
      () => undefined
    )
    this.operationTails.set(ownerKey, operationTail)
    void operationTail.finally(() => {
      if (this.operationTails.get(ownerKey) === operationTail) {
        this.operationTails.delete(ownerKey)
      }
    })
    return result
  }
}

export function createAgentSessionRuntimeOwner(
  input: AgentSessionRuntimeOwner
): AgentSessionRuntimeOwner {
  return {
    agentId: input.agentId,
    projectDirectory: input.projectDirectory,
    projectId: input.projectId,
    workspaceDirectory: input.workspaceDirectory,
    workspaceId: input.workspaceId
  }
}

export function isOwnedAgentSession(
  owner: AgentSessionRuntimeOwner,
  session: Pick<AgentSessionRuntimeOwner, 'agentId' | 'projectId' | 'workspaceId'>
): boolean {
  return (
    session.agentId === owner.agentId &&
    session.projectId === owner.projectId &&
    session.workspaceId === owner.workspaceId
  )
}

function createAgentSessionRuntimeOwnerKey(owner: AgentSessionRuntimeOwner): string {
  return createCanvasObjectIdentityKey({
    projectId: owner.projectId,
    workspaceId: owner.workspaceId,
    objectKind: 'agent',
    objectId: owner.agentId
  })
}
