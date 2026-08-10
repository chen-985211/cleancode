import { mkdtemp, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  cleanupRevokedTerminalProviderHeartbeat,
  createTerminalProviderHeartbeat,
  createTerminalProviderLivenessReference,
  getTerminalProviderHeartbeatPath,
  observeTerminalProviderLiveness,
  revokeDeadTerminalProviderHeartbeat,
  revokeTerminalProviderHeartbeat,
  terminalProviderHeartbeatIntervalMs,
  terminalProviderHeartbeatStaleAfterMs,
  type TerminalProviderHeartbeatLease,
  type TerminalProviderHeartbeatOwner,
  type TerminalProviderLivenessReference
} from '../../../../src/contexts/run/infrastructure/provider/TerminalProviderHeartbeat'

type HeartbeatOwner = TerminalProviderHeartbeatOwner & {
  readonly liveness: TerminalProviderLivenessReference
}

describe('Terminal Provider heartbeat', () => {
  let stateDirectory = ''
  let leases: TerminalProviderHeartbeatLease[] = []

  beforeEach(async () => {
    stateDirectory = await mkdtemp(join(tmpdir(), 'cc-provider-heartbeat-'))
    leases = []
  })

  afterEach(async () => {
    await Promise.all(leases.map((lease) => lease.close().catch(() => undefined)))
    await rm(stateDirectory, { force: true, recursive: true })
  })

  it('reports a Provider as alive after creating its heartbeat', async () => {
    const owner = createOwner()
    await createLease(owner)

    await expect(
      observeTerminalProviderLiveness(stateDirectory, owner, () => true)
    ).resolves.toMatchObject({ state: 'alive' })
  })

  it('uses the PID probe for legacy metadata without a liveness reference', async () => {
    const owner: TerminalProviderHeartbeatOwner = {
      instanceId: 'legacy-provider',
      processId: 4242,
      startedAt: new Date().toISOString()
    }
    const processIsAlive = vi.fn((processId: number) => processId === owner.processId)

    await expect(
      observeTerminalProviderLiveness(stateDirectory, owner, processIsAlive)
    ).resolves.toMatchObject({ state: 'alive' })
    expect(processIsAlive).toHaveBeenCalledWith(owner.processId)

    await expect(
      observeTerminalProviderLiveness(stateDirectory, owner, () => false)
    ).resolves.toEqual({ state: 'dead' })
  })

  it('treats a provisional PID as starting during its grace period and dead afterwards', async () => {
    const processIsAlive = vi.fn(() => true)

    await expect(
      observeTerminalProviderLiveness(stateDirectory, createOwner({ processId: 0 }), processIsAlive)
    ).resolves.toEqual({ state: 'starting' })
    await expect(
      observeTerminalProviderLiveness(
        stateDirectory,
        createOwner({
          processId: 0,
          startedAt: new Date(Date.now() - terminalProviderHeartbeatStaleAfterMs - 1).toISOString()
        }),
        processIsAlive
      )
    ).resolves.toEqual({ state: 'dead' })
    expect(processIsAlive).not.toHaveBeenCalled()
  })

  it('reports a stale heartbeat as dead even when an unrelated process reused the PID', async () => {
    const owner = createOwner()
    await createLease(owner)
    const path = getTerminalProviderHeartbeatPath(stateDirectory, owner.liveness)
    const stale = new Date(Date.now() - terminalProviderHeartbeatStaleAfterMs - 1)
    await utimes(path, stale, stale)

    await expect(
      observeTerminalProviderLiveness(stateDirectory, owner, () => true)
    ).resolves.toEqual({ state: 'dead' })
  })

  it('treats a missing heartbeat as starting during startup grace and dead afterwards', async () => {
    await expect(
      observeTerminalProviderLiveness(stateDirectory, createOwner(), () => true)
    ).resolves.toEqual({ state: 'starting' })
    await expect(
      observeTerminalProviderLiveness(
        stateDirectory,
        createOwner({
          startedAt: new Date(Date.now() - terminalProviderHeartbeatStaleAfterMs - 1).toISOString()
        }),
        () => true
      )
    ).resolves.toEqual({ state: 'dead' })
  })

  it('fails closed when the heartbeat contents are corrupt', async () => {
    const owner = createOwner()
    await createLease(owner)
    const path = getTerminalProviderHeartbeatPath(stateDirectory, owner.liveness)
    await writeFile(path, '{incomplete', 'utf8')

    await expect(
      observeTerminalProviderLiveness(stateDirectory, owner, () => true)
    ).resolves.toEqual({ state: 'unknown' })
  })

  it('fails closed when the heartbeat belongs to a different Provider identity', async () => {
    const owner = createOwner()
    await createLease(owner)
    const successor = { ...owner, instanceId: 'successor-provider' }

    await expect(
      observeTerminalProviderLiveness(stateDirectory, successor, () => true)
    ).resolves.toEqual({ state: 'unknown' })
  })

  it('fails closed when the heartbeat timestamp is implausibly in the future', async () => {
    const owner = createOwner()
    await createLease(owner)
    const path = getTerminalProviderHeartbeatPath(stateDirectory, owner.liveness)
    const future = new Date(Date.now() + terminalProviderHeartbeatIntervalMs * 2)
    await utimes(path, future, future)

    await expect(
      observeTerminalProviderLiveness(stateDirectory, owner, () => true)
    ).resolves.toEqual({ state: 'unknown' })
  })

  it('cannot refresh or recreate the canonical heartbeat after revocation', async () => {
    const owner = createOwner()
    const lease = await createLease(owner)
    const path = getTerminalProviderHeartbeatPath(stateDirectory, owner.liveness)
    const revokedPath = await revokeTerminalProviderHeartbeat(stateDirectory, owner)

    await expect(lease.refresh()).rejects.toThrow('Terminal Provider heartbeat ownership was lost.')
    await expect(pathExists(path)).resolves.toBe(false)
    await expect(pathExists(revokedPath!)).resolves.toBe(true)

    await lease.close()
    await expect(pathExists(path)).resolves.toBe(false)
    await cleanupRevokedTerminalProviderHeartbeat(revokedPath)
  })

  it('revokes an expired generation without waiting for its blocked startup operation', async () => {
    const owner = createOwner()
    const lease = await createLease(owner)
    const path = getTerminalProviderHeartbeatPath(stateDirectory, owner.liveness)
    let releaseOwnership: (() => void) | undefined
    let markOwnershipHeld: (() => void) | undefined
    const ownershipHeld = new Promise<void>((resolve) => {
      markOwnershipHeld = resolve
    })
    const ownershipReleased = new Promise<void>((resolve) => {
      releaseOwnership = resolve
    })
    const resumedPulse = lease.runWhileOwned(async () => {
      markOwnershipHeld?.()
      await ownershipReleased
    })
    await ownershipHeld
    const stale = new Date(Date.now() - terminalProviderHeartbeatStaleAfterMs - 1)
    await utimes(path, stale, stale)

    const revocation = revokeDeadTerminalProviderHeartbeat(stateDirectory, owner, () => true)
    await expect(revocation).resolves.toMatchObject({
      observation: { state: 'dead' }
    })
    await expect(pathExists(path)).resolves.toBe(false)

    releaseOwnership?.()
    await expect(resumedPulse).rejects.toThrow('Terminal Provider heartbeat ownership was lost.')
  })

  it('cancels conditional revocation when the observed heartbeat refreshes before claim', async () => {
    const owner = createOwner()
    const lease = await createLease(owner)
    const path = getTerminalProviderHeartbeatPath(stateDirectory, owner.liveness)
    const stale = new Date(Date.now() - terminalProviderHeartbeatStaleAfterMs - 1)
    await utimes(path, stale, stale)
    let continueClaim: (() => void) | undefined
    let markDeadObserved: (() => void) | undefined
    const deadObserved = new Promise<void>((resolve) => {
      markDeadObserved = resolve
    })
    const claimAllowed = new Promise<void>((resolve) => {
      continueClaim = resolve
    })

    const revocation = revokeDeadTerminalProviderHeartbeat(stateDirectory, owner, () => true, {
      beforeConditionalClaim: async () => {
        markDeadObserved?.()
        await claimAllowed
      }
    })
    await deadObserved
    await lease.refresh()
    continueClaim?.()

    await expect(revocation).resolves.toEqual({
      observation: { state: 'unknown' },
      revokedPath: null
    })
    await expect(pathExists(path)).resolves.toBe(true)
  })

  it('does not delete a successor heartbeat when the old lease closes', async () => {
    const owner = createOwner()
    const lease = await createLease(owner)
    const path = getTerminalProviderHeartbeatPath(stateDirectory, owner.liveness)
    const revokedPath = await revokeTerminalProviderHeartbeat(stateDirectory, owner)
    const successor = {
      schemaVersion: 1,
      heartbeatId: owner.liveness.heartbeatId,
      instanceId: 'successor-provider',
      processId: owner.processId + 1,
      startedAt: new Date().toISOString()
    }
    await writeFile(path, `${JSON.stringify(successor)}\n`, { encoding: 'utf8', mode: 0o600 })

    await lease.close()

    await expect(readFile(path, 'utf8')).resolves.toBe(`${JSON.stringify(successor)}\n`)
    await cleanupRevokedTerminalProviderHeartbeat(revokedPath)
  })

  async function createLease(owner: HeartbeatOwner): Promise<TerminalProviderHeartbeatLease> {
    const lease = await createTerminalProviderHeartbeat({
      stateDirectory,
      owner,
      onFailure: vi.fn()
    })
    leases.push(lease)
    return lease
  }
})

function createOwner(overrides: Partial<HeartbeatOwner> = {}): HeartbeatOwner {
  return {
    instanceId: 'provider-instance',
    processId: 4242,
    startedAt: new Date().toISOString(),
    liveness: createTerminalProviderLivenessReference(),
    ...overrides
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch (error) {
    return !isMissingPathError(error)
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  )
}
