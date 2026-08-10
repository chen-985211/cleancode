import { randomUUID } from 'node:crypto'
import { link, open, mkdir, readFile, rename, rm, stat, utimes } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'

export interface TerminalProviderLivenessReference {
  readonly schemaVersion: 1
  readonly heartbeatId: string
}

export interface TerminalProviderHeartbeatOwner {
  readonly instanceId: string
  readonly processId: number
  readonly startedAt: string
  readonly liveness?: TerminalProviderLivenessReference
}

export type TerminalProviderLivenessObservation =
  | { readonly state: 'alive'; readonly modifiedAtMs: number }
  | { readonly state: 'starting' | 'dead' | 'unknown' }

export interface TerminalProviderHeartbeatLease {
  close(): Promise<void>
  refresh(): Promise<void>
  runWhileOwned<T>(operation: () => Promise<T>): Promise<T>
}

export interface TerminalProviderHeartbeatRevocation {
  readonly observation: TerminalProviderLivenessObservation
  readonly revokedPath: string | null
}

interface TerminalProviderHeartbeatRevocationEnvironment {
  readonly beforeConditionalClaim?: () => Promise<void>
}

interface TerminalProviderHeartbeatRecord {
  readonly schemaVersion: 1
  readonly heartbeatId: string
  readonly instanceId: string
  readonly processId: number
  readonly startedAt: string
}

interface ValidTerminalProviderHeartbeatSnapshot {
  readonly status: 'valid'
  readonly device: number
  readonly inode: number
  readonly modifiedAtMs: number
  readonly record: TerminalProviderHeartbeatRecord
  readonly size: number
}

type HeartbeatClaimResult =
  { readonly state: 'changed' | 'missing' } | { readonly state: 'claimed'; readonly path: string }

export const terminalProviderHeartbeatIntervalMs = 2_000
export const terminalProviderHeartbeatStaleAfterMs = 15_000
const terminalProviderHeartbeatStartupGraceMs = 15_000
const terminalProviderHeartbeatDirectoryName = 'provider-heartbeats'
const terminalProviderHeartbeatRestoreRetryDelaysMs = [5, 10, 20, 40, 80, 160, 250] as const
const terminalProviderHeartbeatLinkRetryDelaysMs = [10, 20, 40, 80, 160] as const
const heartbeatIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function createTerminalProviderLivenessReference(): TerminalProviderLivenessReference {
  return { schemaVersion: 1, heartbeatId: randomUUID() }
}

export function isTerminalProviderLivenessReference(
  value: unknown
): value is TerminalProviderLivenessReference {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 1 &&
    'heartbeatId' in value &&
    typeof value.heartbeatId === 'string' &&
    heartbeatIdPattern.test(value.heartbeatId)
  )
}

export function getTerminalProviderHeartbeatPath(
  stateDirectory: string,
  reference: TerminalProviderLivenessReference
): string {
  if (!isTerminalProviderLivenessReference(reference)) {
    throw new Error('Terminal Provider heartbeat identity is invalid.')
  }
  return join(
    stateDirectory,
    terminalProviderHeartbeatDirectoryName,
    `${reference.heartbeatId}.heartbeat`
  )
}

export async function createTerminalProviderHeartbeat(input: {
  readonly stateDirectory: string
  readonly owner: TerminalProviderHeartbeatOwner & {
    readonly liveness: TerminalProviderLivenessReference
  }
  readonly onFailure: (error: unknown) => void
}): Promise<TerminalProviderHeartbeatLease> {
  const path = getTerminalProviderHeartbeatPath(input.stateDirectory, input.owner.liveness)
  const record = createHeartbeatRecord(input.owner)
  await mkdir(dirname(path), { mode: 0o700, recursive: true })
  const handle = await open(path, 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8')
    await handle.sync()
  } catch (error) {
    await handle.close().catch(() => undefined)
    await rm(path, { force: true }).catch(() => undefined)
    throw error
  }
  await handle.close()
  return new FileTerminalProviderHeartbeatLease(path, record, input.onFailure)
}

export async function observeTerminalProviderLiveness(
  stateDirectory: string,
  owner: TerminalProviderHeartbeatOwner,
  processIsAlive: (processId: number) => boolean
): Promise<TerminalProviderLivenessObservation> {
  return (await observeTerminalProviderLivenessDetails(stateDirectory, owner, processIsAlive))
    .observation
}

async function observeTerminalProviderLivenessDetails(
  stateDirectory: string,
  owner: TerminalProviderHeartbeatOwner,
  processIsAlive: (processId: number) => boolean
): Promise<{
  readonly observation: TerminalProviderLivenessObservation
  readonly snapshot: ValidTerminalProviderHeartbeatSnapshot | null
}> {
  const processState = observeProcessState(owner, processIsAlive)
  if (processState !== 'alive') {
    return { observation: { state: processState }, snapshot: null }
  }
  if (!owner.liveness) {
    return { observation: { state: 'alive', modifiedAtMs: Date.now() }, snapshot: null }
  }
  const heartbeatOwner = { ...owner, liveness: owner.liveness }

  const path = getTerminalProviderHeartbeatPath(stateDirectory, heartbeatOwner.liveness)
  const snapshot = await readHeartbeatSnapshot(path)
  if (snapshot.status === 'missing') {
    const ownerAgeMs = getOwnerAgeMs(owner.startedAt)
    if (ownerAgeMs === null) {
      return { observation: { state: 'unknown' }, snapshot: null }
    }
    return {
      observation:
        ownerAgeMs <= terminalProviderHeartbeatStartupGraceMs
          ? { state: 'starting' }
          : { state: 'dead' },
      snapshot: null
    }
  }
  if (snapshot.status === 'unknown' || snapshot.status === 'unavailable') {
    return { observation: { state: 'unknown' }, snapshot: null }
  }
  if (!heartbeatMatchesOwner(snapshot.record, heartbeatOwner)) {
    return { observation: { state: 'unknown' }, snapshot: null }
  }
  const now = Date.now()
  if (snapshot.modifiedAtMs > now + terminalProviderHeartbeatIntervalMs) {
    return { observation: { state: 'unknown' }, snapshot }
  }
  return {
    observation:
      now - snapshot.modifiedAtMs <= terminalProviderHeartbeatStaleAfterMs
        ? { state: 'alive', modifiedAtMs: snapshot.modifiedAtMs }
        : { state: 'dead' },
    snapshot
  }
}

export async function revokeTerminalProviderHeartbeat(
  stateDirectory: string,
  owner: TerminalProviderHeartbeatOwner
): Promise<string | null> {
  if (!owner.liveness) return null
  const path = getTerminalProviderHeartbeatPath(stateDirectory, owner.liveness)
  const claim = await claimHeartbeatPath(
    path,
    createHeartbeatRecord({ ...owner, liveness: owner.liveness }),
    'revoked'
  )
  if (claim.state === 'changed') throw new HeartbeatOwnershipLostError()
  return claim.state === 'claimed' ? claim.path : null
}

export async function revokeDeadTerminalProviderHeartbeat(
  stateDirectory: string,
  owner: TerminalProviderHeartbeatOwner,
  processIsAlive: (processId: number) => boolean,
  environment: TerminalProviderHeartbeatRevocationEnvironment = {}
): Promise<TerminalProviderHeartbeatRevocation> {
  if (!owner.liveness) {
    return {
      observation: await observeTerminalProviderLiveness(stateDirectory, owner, processIsAlive),
      revokedPath: null
    }
  }
  const path = getTerminalProviderHeartbeatPath(stateDirectory, owner.liveness)
  const observed = await observeTerminalProviderLivenessDetails(
    stateDirectory,
    owner,
    processIsAlive
  )
  if (observed.observation.state !== 'dead') {
    return { observation: observed.observation, revokedPath: null }
  }
  await environment.beforeConditionalClaim?.()
  const claim = await claimHeartbeatPath(
    path,
    createHeartbeatRecord({ ...owner, liveness: owner.liveness }),
    'revoked',
    observed.snapshot
  )
  if (claim.state === 'changed') {
    return { observation: { state: 'unknown' }, revokedPath: null }
  }
  return {
    observation: observed.observation,
    revokedPath: claim.state === 'claimed' ? claim.path : null
  }
}

export function cleanupRevokedTerminalProviderHeartbeat(path: string | null): Promise<void> {
  return path ? rm(path, { force: true }) : Promise.resolve()
}

class FileTerminalProviderHeartbeatLease implements TerminalProviderHeartbeatLease {
  private closePromise: Promise<void> | null = null
  private failureReported = false
  private lastSuccessfulRefreshAtMs = performance.now()
  private operationTail: Promise<void> = Promise.resolve()
  private refreshPromise: Promise<void> | null = null
  private readonly timer: NodeJS.Timeout

  constructor(
    private readonly path: string,
    private readonly record: TerminalProviderHeartbeatRecord,
    private readonly onFailure: (error: unknown) => void
  ) {
    this.timer = setInterval(() => {
      if (this.refreshPromise || this.closePromise) return
      this.refreshPromise = this.refresh()
        .catch((error) => this.handleScheduledRefreshFailure(error))
        .finally(() => {
          this.refreshPromise = null
        })
    }, terminalProviderHeartbeatIntervalMs)
    this.timer.unref()
  }

  async refresh(): Promise<void> {
    if (this.closePromise) throw new Error('Terminal Provider heartbeat is already closed.')
    await this.runExclusive(() => this.pulse())
  }

  async runWhileOwned<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closePromise) throw new Error('Terminal Provider heartbeat is already closed.')
    return this.runExclusive(async () => {
      await this.pulse()
      const result = await operation()
      await this.pulse()
      return result
    })
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise
    this.closePromise = this.release()
    return this.closePromise
  }

  private async release(): Promise<void> {
    clearInterval(this.timer)
    await this.refreshPromise
    await this.operationTail
    const claim = await claimHeartbeatPath(this.path, this.record, 'closed')
    if (claim.state === 'claimed') await rm(claim.path, { force: true })
  }

  private handleScheduledRefreshFailure(error: unknown): void {
    if (
      error instanceof HeartbeatOwnershipLostError ||
      performance.now() - this.lastSuccessfulRefreshAtMs >= terminalProviderHeartbeatStaleAfterMs
    ) {
      this.reportFailure(error)
    }
  }

  private reportFailure(error: unknown): void {
    if (this.failureReported || this.closePromise) return
    this.failureReported = true
    clearInterval(this.timer)
    this.onFailure(error)
  }

  private async assertCurrentOwner(): Promise<void> {
    let snapshot = await readHeartbeatSnapshot(this.path)
    if (snapshot.status === 'missing') {
      for (const delayMs of terminalProviderHeartbeatRestoreRetryDelaysMs) {
        await delayHeartbeatOperation(delayMs)
        snapshot = await readHeartbeatSnapshot(this.path)
        if (snapshot.status !== 'missing') break
      }
    }
    if (snapshot.status === 'unavailable') throw snapshot.error
    if (snapshot.status !== 'valid' || !recordsAreEqual(snapshot.record, this.record)) {
      throw new HeartbeatOwnershipLostError()
    }
  }

  private async pulse(): Promise<void> {
    await this.assertCurrentOwner()
    const now = new Date()
    try {
      await utimes(this.path, now, now)
    } catch (error) {
      if (isMissingPathError(error)) throw new HeartbeatOwnershipLostError()
      throw error
    }
    await this.assertCurrentOwner()
    this.lastSuccessfulRefreshAtMs = performance.now()
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation)
    this.operationTail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }
}

class HeartbeatOwnershipLostError extends Error {
  constructor() {
    super('Terminal Provider heartbeat ownership was lost.')
  }
}

function createHeartbeatRecord(
  owner: TerminalProviderHeartbeatOwner & {
    readonly liveness: TerminalProviderLivenessReference
  }
): TerminalProviderHeartbeatRecord {
  return {
    schemaVersion: 1,
    heartbeatId: owner.liveness.heartbeatId,
    instanceId: owner.instanceId,
    processId: owner.processId,
    startedAt: owner.startedAt
  }
}

function observeProcessState(
  owner: TerminalProviderHeartbeatOwner,
  processIsAlive: (processId: number) => boolean
): 'alive' | 'starting' | 'dead' | 'unknown' {
  if (!Number.isSafeInteger(owner.processId) || owner.processId < 0) return 'unknown'
  if (owner.processId === 0) {
    const ageMs = getOwnerAgeMs(owner.startedAt)
    if (ageMs === null) return 'unknown'
    return ageMs <= terminalProviderHeartbeatStartupGraceMs ? 'starting' : 'dead'
  }
  try {
    return processIsAlive(owner.processId) ? 'alive' : 'dead'
  } catch {
    return 'unknown'
  }
}

function getOwnerAgeMs(startedAt: string): number | null {
  const startedAtMs = Date.parse(startedAt)
  if (!Number.isFinite(startedAtMs)) return null
  const now = Date.now()
  if (startedAtMs > now + terminalProviderHeartbeatIntervalMs) {
    return null
  }
  return Math.max(0, now - startedAtMs)
}

async function readHeartbeatSnapshot(
  path: string
): Promise<
  | { readonly status: 'missing' }
  | { readonly status: 'unknown' }
  | { readonly status: 'unavailable'; readonly error: unknown }
  | ValidTerminalProviderHeartbeatSnapshot
> {
  let before: Awaited<ReturnType<typeof stat>>
  let contents: string
  let after: Awaited<ReturnType<typeof stat>>
  try {
    before = await stat(path)
    contents = await readFile(path, 'utf8')
    after = await stat(path)
  } catch (error) {
    const code = getErrorCode(error)
    return code === 'ENOENT' || code === 'ENOTDIR'
      ? { status: 'missing' }
      : { status: 'unavailable', error }
  }
  let value: unknown
  try {
    value = JSON.parse(contents)
  } catch {
    return { status: 'unknown' }
  }
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.mtimeMs !== after.mtimeMs ||
    before.size !== after.size ||
    !isHeartbeatRecord(value)
  ) {
    return { status: 'unknown' }
  }
  return {
    status: 'valid',
    device: after.dev,
    inode: after.ino,
    modifiedAtMs: after.mtimeMs,
    record: value,
    size: after.size
  }
}

function heartbeatMatchesOwner(
  record: TerminalProviderHeartbeatRecord,
  owner: TerminalProviderHeartbeatOwner & { readonly liveness: TerminalProviderLivenessReference }
): boolean {
  return (
    record.heartbeatId === owner.liveness.heartbeatId &&
    record.instanceId === owner.instanceId &&
    record.processId === owner.processId &&
    record.startedAt === owner.startedAt
  )
}

function recordsAreEqual(
  first: TerminalProviderHeartbeatRecord,
  second: TerminalProviderHeartbeatRecord
): boolean {
  return (
    first.heartbeatId === second.heartbeatId &&
    first.instanceId === second.instanceId &&
    first.processId === second.processId &&
    first.startedAt === second.startedAt
  )
}

function isHeartbeatRecord(value: unknown): value is TerminalProviderHeartbeatRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 1 &&
    'heartbeatId' in value &&
    typeof value.heartbeatId === 'string' &&
    heartbeatIdPattern.test(value.heartbeatId) &&
    'instanceId' in value &&
    typeof value.instanceId === 'string' &&
    value.instanceId.length > 0 &&
    'processId' in value &&
    typeof value.processId === 'number' &&
    Number.isSafeInteger(value.processId) &&
    value.processId > 0 &&
    'startedAt' in value &&
    typeof value.startedAt === 'string' &&
    Number.isFinite(Date.parse(value.startedAt))
  )
}

function getErrorCode(error: unknown): string | null {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : null
}

async function claimHeartbeatPath(
  path: string,
  expected: TerminalProviderHeartbeatRecord,
  reason: 'closed' | 'revoked',
  expectedSnapshot: ValidTerminalProviderHeartbeatSnapshot | null = null
): Promise<HeartbeatClaimResult> {
  const snapshot = await readHeartbeatSnapshot(path)
  if (snapshot.status === 'missing') return { state: 'missing' }
  if (snapshot.status === 'unavailable') throw snapshot.error
  if (snapshot.status !== 'valid' || !recordsAreEqual(snapshot.record, expected)) {
    return { state: 'changed' }
  }
  if (expectedSnapshot && !heartbeatSnapshotsAreEqual(snapshot, expectedSnapshot)) {
    return { state: 'changed' }
  }
  const claimedPath = `${path}.${reason}-${randomUUID()}`
  try {
    await rename(path, claimedPath)
  } catch (error) {
    if (isMissingPathError(error)) return { state: 'missing' }
    throw error
  }
  const claimed = await readHeartbeatSnapshot(claimedPath)
  const claimMatches =
    claimed.status === 'valid' &&
    recordsAreEqual(claimed.record, expected) &&
    (!expectedSnapshot || heartbeatSnapshotsAreEqual(claimed, expectedSnapshot))
  if (claimMatches) {
    return { path: claimedPath, state: 'claimed' }
  }
  await restoreClaimedHeartbeat(claimedPath, path, expected)
  return { state: 'changed' }
}

async function restoreClaimedHeartbeat(
  claimedPath: string,
  path: string,
  expected: TerminalProviderHeartbeatRecord
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await link(claimedPath, path)
      await rm(claimedPath, { force: true })
      return
    } catch (error) {
      if (getErrorCode(error) === 'EEXIST') break
      const retryDelayMs = terminalProviderHeartbeatLinkRetryDelaysMs[attempt]
      if (retryDelayMs === undefined || !isTransientHeartbeatLinkError(error)) throw error
      await delayHeartbeatOperation(retryDelayMs)
    }
  }
  const current = await readHeartbeatSnapshot(path)
  if (current.status === 'valid' && recordsAreEqual(current.record, expected)) {
    await rm(claimedPath, { force: true })
    return
  }
  throw new HeartbeatOwnershipLostError()
}

function isTransientHeartbeatLinkError(error: unknown): boolean {
  return ['EACCES', 'EBUSY', 'EPERM'].includes(getErrorCode(error) ?? '')
}

function heartbeatSnapshotsAreEqual(
  first: ValidTerminalProviderHeartbeatSnapshot,
  second: ValidTerminalProviderHeartbeatSnapshot
): boolean {
  return (
    first.device === second.device &&
    first.inode === second.inode &&
    first.modifiedAtMs === second.modifiedAtMs &&
    first.size === second.size &&
    recordsAreEqual(first.record, second.record)
  )
}

function delayHeartbeatOperation(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

function isMissingPathError(error: unknown): boolean {
  const code = getErrorCode(error)
  return code === 'ENOENT' || code === 'ENOTDIR'
}
