import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'
import {
  createTerminalRunSlotKey,
  type TerminalRunOwner
} from '../../domain/value-objects/TerminalRunScope'

export interface RunStartGateLease {
  readonly wasQuarantined: boolean
  quarantine(): void
  release(): void
  resolve(): void
}

interface TrackedRunResource {
  readonly owner: TerminalRunOwner
  readonly dispose: () => Promise<void>
}

type OwnerPredicate = (owner: TerminalRunOwner) => boolean

interface RunGateBlockerSpec {
  readonly quarantineKey: string
  readonly resolvesPrefix: boolean
  readonly predicate: OwnerPredicate
}

export class RunLifecycleService {
  private readonly blockers = new Set<OwnerPredicate>()
  private readonly resources = new Set<TrackedRunResource>()
  private readonly operationTails = new Map<
    string,
    { readonly owner: TerminalRunOwner; readonly tail: Promise<void> }
  >()
  private readonly lifecycleLeaseTails = new Map<string, Promise<void>>()
  private readonly activeLeaseReleases = new Set<() => void>()
  private readonly quarantinedBlockers = new Map<string, Set<() => void>>()
  private isShuttingDown = false

  runStart<T>(owner: TerminalRunOwner, operation: () => Promise<T>): Promise<T> {
    return this.runStartMany([owner], operation)
  }

  runStartMany<T>(owners: readonly TerminalRunOwner[], operation: () => Promise<T>): Promise<T> {
    const uniqueOwners = uniqueRunOwners(owners)
    try {
      for (const owner of uniqueOwners) this.assertStartAllowed(owner)
    } catch (error) {
      return Promise.reject(error)
    }
    const previous = Promise.all(
      uniqueOwners.map(
        (owner) =>
          this.operationTails.get(createTerminalRunSlotKey(owner))?.tail ?? Promise.resolve()
      )
    )
    const result = previous
      .catch(() => undefined)
      .then(async () => {
        for (const owner of uniqueOwners) this.assertStartAllowed(owner)
        return operation()
      })
    const tail = result.then(
      () => undefined,
      () => undefined
    )
    for (const owner of uniqueOwners) {
      this.operationTails.set(createTerminalRunSlotKey(owner), { owner, tail })
    }
    void tail.finally(() => {
      for (const owner of uniqueOwners) {
        const ownerKey = createTerminalRunSlotKey(owner)
        if (this.operationTails.get(ownerKey)?.tail === tail) {
          this.operationTails.delete(ownerKey)
        }
      }
    })
    return result
  }

  track(owner: TerminalRunOwner, dispose: () => Promise<void>): () => void {
    const resource: TrackedRunResource = { owner: { ...owner }, dispose }
    this.resources.add(resource)
    let active = true
    return () => {
      if (!active) return
      active = false
      this.resources.delete(resource)
    }
  }

  hardDisposeWorkspace(command: {
    readonly projectDirectory: string
    readonly workspaceName: string
  }): Promise<RunStartGateLease> {
    return this.hardDisposeWorkspaces({
      projectDirectory: command.projectDirectory,
      workspaceNames: [command.workspaceName]
    })
  }

  hardDisposeWorkspaces(command: {
    readonly projectDirectory: string
    readonly workspaceNames: readonly string[]
  }): Promise<RunStartGateLease> {
    const workspaceNames = [...new Set(command.workspaceNames)]
    if (workspaceNames.length === 0) return Promise.resolve(createInactiveRunStartGateLease())

    const blockers = workspaceNames.map((workspaceName): RunGateBlockerSpec => ({
      quarantineKey: workspaceQuarantineKey(command.projectDirectory, workspaceName),
      resolvesPrefix: false,
      predicate: (owner) =>
        owner.projectDirectory === command.projectDirectory && owner.workspaceName === workspaceName
    }))

    return this.runWithGate(`project:${command.projectDirectory}`, blockers)
  }

  hardDisposeProject(projectDirectory: string): Promise<RunStartGateLease> {
    return this.runWithGate(`project:${projectDirectory}`, [
      {
        quarantineKey: projectQuarantinePrefix(projectDirectory),
        resolvesPrefix: true,
        predicate: (owner) => owner.projectDirectory === projectDirectory
      }
    ])
  }

  hardDisposeTerminal(command: {
    readonly projectId: string
    readonly projectDirectory: string
    readonly workspaceName: string
    readonly blockId: string
  }): Promise<RunStartGateLease> {
    return this.runWithGate(`project:${command.projectDirectory}`, [
      {
        quarantineKey: `${workspaceQuarantineKey(command.projectDirectory, command.workspaceName)}\0block:${command.blockId}`,
        resolvesPrefix: false,
        predicate: (owner) =>
          owner.projectId === command.projectId &&
          owner.projectDirectory === command.projectDirectory &&
          owner.workspaceName === command.workspaceName &&
          owner.blockId === command.blockId
      }
    ])
  }

  isWorkspaceQuarantined(command: {
    readonly projectDirectory: string
    readonly workspaceName: string
  }): boolean {
    const projectKey = projectQuarantinePrefix(command.projectDirectory)
    const key = workspaceQuarantineKey(command.projectDirectory, command.workspaceName)
    return [...this.quarantinedBlockers.keys()].some(
      (candidate) =>
        candidate === projectKey || candidate === key || candidate.startsWith(`${key}\0`)
    )
  }

  resolveProjectQuarantines(projectDirectory: string): void {
    this.releaseQuarantines(projectQuarantinePrefix(projectDirectory), true)
  }

  async hardDisposeAll(): Promise<void> {
    this.isShuttingDown = true
    for (const release of [...this.activeLeaseReleases]) release()
    await this.waitForOperations(() => true)
    await this.disposeResources(() => true)
    this.blockers.clear()
    this.quarantinedBlockers.clear()
  }

  async prepareApplicationShutdown(): Promise<void> {
    this.isShuttingDown = true
    for (const release of [...this.activeLeaseReleases]) release()
    await this.waitForOperations(() => true)
    this.blockers.clear()
    this.quarantinedBlockers.clear()
  }

  private async runWithGate(
    lockKey: string,
    blockerSpecs: readonly RunGateBlockerSpec[]
  ): Promise<RunStartGateLease> {
    const predicate: OwnerPredicate = (owner) =>
      blockerSpecs.some((blocker) => blocker.predicate(owner))
    const lease = await this.acquireGateLease(lockKey, blockerSpecs)
    try {
      await this.waitForOperations(predicate)
      await this.disposeResources(predicate)
      return lease
    } catch (error) {
      lease.quarantine()
      throw error
    }
  }

  private async acquireGateLease(
    lockKey: string,
    blockerSpecs: readonly RunGateBlockerSpec[]
  ): Promise<RunStartGateLease> {
    if (this.isShuttingDown) {
      startBlocked()
    }

    const activeBlockers = blockerSpecs.map((spec) => {
      this.blockers.add(spec.predicate)
      let blockerActive = true
      return {
        ...spec,
        unblock: (): void => {
          if (!blockerActive) return
          blockerActive = false
          this.blockers.delete(spec.predicate)
        }
      }
    })
    const unblockAll = (): void => {
      for (const blocker of activeBlockers) blocker.unblock()
    }
    const previousLease = this.lifecycleLeaseTails.get(lockKey) ?? Promise.resolve()
    let resolveLease: () => void = () => undefined
    const currentLease = new Promise<void>((resolve) => {
      resolveLease = resolve
    })
    let held = true
    const finishLease = (): void => {
      if (!held) return
      held = false
      this.activeLeaseReleases.delete(finishLease)
      resolveLease()
    }
    const tail = previousLease.then(() => currentLease)
    this.lifecycleLeaseTails.set(lockKey, tail)
    this.activeLeaseReleases.add(finishLease)
    void tail.finally(() => {
      if (this.lifecycleLeaseTails.get(lockKey) === tail) {
        this.lifecycleLeaseTails.delete(lockKey)
      }
    })

    await previousLease
    if (this.isShuttingDown) {
      unblockAll()
      finishLease()
      startBlocked()
    }

    const wasQuarantined = activeBlockers.some((blocker) =>
      this.hasQuarantine(blocker.quarantineKey, blocker.resolvesPrefix)
    )
    let active = true
    return {
      wasQuarantined,
      quarantine: () => {
        if (!active) return
        active = false
        for (const blocker of activeBlockers) {
          const quarantined = this.quarantinedBlockers.get(blocker.quarantineKey) ?? new Set()
          quarantined.add(blocker.unblock)
          this.quarantinedBlockers.set(blocker.quarantineKey, quarantined)
        }
        finishLease()
      },
      release: () => {
        if (!active) return
        active = false
        unblockAll()
        finishLease()
      },
      resolve: () => {
        if (!active) return
        active = false
        unblockAll()
        for (const blocker of activeBlockers) {
          this.releaseQuarantines(blocker.quarantineKey, blocker.resolvesPrefix)
        }
        finishLease()
      }
    }
  }

  private async waitForOperations(predicate: OwnerPredicate): Promise<void> {
    while (true) {
      const tails = [...this.operationTails.values()]
        .filter((entry) => predicate(entry.owner))
        .map((entry) => entry.tail)
      if (tails.length === 0) return
      await Promise.all(tails)
    }
  }

  private async disposeResources(predicate: OwnerPredicate): Promise<void> {
    const resources = [...this.resources].filter((resource) => predicate(resource.owner))
    const results = await Promise.allSettled(
      resources.map(async (resource) => {
        await resource.dispose()
        this.resources.delete(resource)
      })
    )
    throwCleanupFailures(results)
  }

  private assertStartAllowed(owner: TerminalRunOwner): void {
    if (this.isShuttingDown || [...this.blockers].some((blocker) => blocker(owner))) {
      startBlocked()
    }
  }

  private hasQuarantine(key: string, prefix: boolean): boolean {
    return [...this.quarantinedBlockers.keys()].some((candidate) =>
      prefix ? candidate.startsWith(key) : candidate === key
    )
  }

  private releaseQuarantines(key: string, prefix: boolean): void {
    for (const [candidate, releases] of this.quarantinedBlockers.entries()) {
      if (prefix ? candidate.startsWith(key) : candidate === key) {
        for (const release of releases) release()
        this.quarantinedBlockers.delete(candidate)
      }
    }
  }
}

function uniqueRunOwners(owners: readonly TerminalRunOwner[]): readonly TerminalRunOwner[] {
  const unique = new Map<string, TerminalRunOwner>()
  for (const owner of owners) unique.set(createTerminalRunSlotKey(owner), owner)
  return [...unique.values()]
}

function throwCleanupFailures(results: readonly PromiseSettledResult<void>[]): void {
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : []
  )
  if (failures.length === 0) return
  if (failures.length === 1) throw failures[0]
  throw new AggregateError(failures, 'Multiple run resources failed to dispose.')
}

function createInactiveRunStartGateLease(): RunStartGateLease {
  return {
    wasQuarantined: false,
    quarantine: () => undefined,
    release: () => undefined,
    resolve: () => undefined
  }
}

function startBlocked(): never {
  throw createExpectedAppError(
    'RUN_START_BLOCKED',
    'Run scope changed before the terminal could start.'
  )
}

function projectQuarantinePrefix(projectDirectory: string): string {
  return `project:${projectDirectory}\0`
}

function workspaceQuarantineKey(projectDirectory: string, workspaceName: string): string {
  return `${projectQuarantinePrefix(projectDirectory)}workspace:${workspaceName}`
}
