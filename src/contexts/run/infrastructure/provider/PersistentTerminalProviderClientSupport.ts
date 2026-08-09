import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, openSync, renameSync, rmSync } from 'node:fs'
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  acquireFileSystemMutationLock,
  type FileSystemMutationLockFileSystem,
  type FileSystemMutationLockLease
} from './FileSystemMutationLock'
import {
  createFileProviderLaunchLockLease,
  type ProviderLaunchLockLease
} from './FileProviderLaunchLockLease'
import {
  createProcessEpochLease,
  isProcessEpochReference,
  observeProcessEpoch,
  type ProcessEpochLease,
  type ProcessEpochObservation,
  type ProcessEpochReference
} from './ProcessEpochLiveness'

export type { ProviderLaunchLockLease } from './FileProviderLaunchLockLease'
export {
  createProviderUnavailableError,
  getProviderErrorMessage,
  isRuntimeInvalidatingProviderError
} from './TerminalProviderErrors'
export {
  createProviderDiagnostics,
  isApplicationDetachReceipt,
  matchesForegroundJob
} from './TerminalProviderPredicates'
export {
  atomicWriteProviderMetadata,
  readProviderMetadata,
  removeStaleProviderMetadata,
  type TerminalProviderMetadata
} from './TerminalProviderMetadataStore'

export interface ProviderLaunchLockEnvironment {
  readonly fileSystem?: FileSystemMutationLockFileSystem
}

interface ProviderLaunchLockRecord {
  readonly schemaVersion: 1
  readonly ownerId: string
  readonly processId: number
  readonly acquiredAt: string
  readonly processEpoch?: ProcessEpochReference
}

interface ProviderLaunchLockSnapshot {
  readonly contentFingerprint: string | null
  readonly device: number
  readonly inode: number
  readonly modifiedAtMs: number
  readonly record: ProviderLaunchLockRecord | LegacyProviderLaunchLockRecord | null
  readonly size: number
}

interface CreatedProviderLaunchLockIdentity {
  readonly device: number
  readonly inode: number
  readonly ownerId: string
}

class ProviderLaunchLockCreationError extends Error {
  constructor(
    readonly creationError: unknown,
    readonly identity: CreatedProviderLaunchLockIdentity,
    readonly cleanupErrors: readonly unknown[]
  ) {
    super('Terminal Provider launch lock initialization failed.', { cause: creationError })
  }
}

interface LegacyProviderLaunchLockRecord {
  readonly processId: number
}

const providerLaunchLockInitializationGraceMs = 250
const providerLaunchLockRefreshIntervalMs = 5_000
const providerLaunchLockStaleAfterMs = 30_000
const providerLaunchLockMutationGuardSuffix = '.reclaim-guard'
const providerLaunchLockNodeFileSystem: FileSystemMutationLockFileSystem = {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat
}

export function createProviderEndpoint(stateDirectory: string, generationId?: string): string {
  const digest = createHash('sha256').update(stateDirectory)
  if (generationId) digest.update('\0').update(generationId)
  const suffix = digest.digest('hex').slice(0, 24)
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\cleancode-terminal-${suffix}`
    : join(tmpdir(), `cleancode-terminal-${suffix}.sock`)
}

export function isProviderProcessAlive(processId: number): boolean {
  if (!Number.isSafeInteger(processId) || processId <= 0) return false
  try {
    process.kill(processId, 0)
    return true
  } catch (error) {
    return getNodeErrorCode(error) !== 'ESRCH'
  }
}

export async function providerEndpointAcceptsConnections(endpoint: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect(endpoint)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })
}

export function rotateProviderLog(path: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  if (!existsSync(path)) return
  try {
    for (let index = 3; index >= 1; index -= 1) {
      const source = index === 1 ? path : `${path}.${index - 1}`
      const target = `${path}.${index}`
      if (!existsSync(source)) continue
      rmSync(target, { force: true })
      renameSync(source, target)
    }
  } catch {
    // Provider startup can continue when diagnostics rotation is unavailable.
  }
}

export function openProviderProcessLog(stateDirectory: string): number {
  const path = join(stateDirectory, 'provider-process.log')
  rotateProviderLog(path)
  return openSync(path, 'a', 0o600)
}

export async function acquireProviderLaunchLock(
  path: string,
  environment: ProviderLaunchLockEnvironment = {}
): Promise<ProviderLaunchLockLease | null> {
  const fileSystem = environment.fileSystem ?? providerLaunchLockNodeFileSystem
  let initializationObservation: {
    readonly deadlineMs: number
    readonly snapshot: ProviderLaunchLockSnapshot
  } | null = null
  for (;;) {
    const mutationLock = await acquireProviderLaunchMutationLock(path, fileSystem)
    let initializationDelayMs = 0
    let mutationHandoffStarted = false
    try {
      await mutationLock.assertOwned()
      const snapshot = await readLaunchLockSnapshot(path, fileSystem)
      if (!snapshot) {
        let lease: ProviderLaunchLockLease
        try {
          lease = await createLaunchLock(path, fileSystem)
        } catch (error) {
          if (!(error instanceof ProviderLaunchLockCreationError)) throw error
          mutationHandoffStarted = true
          const cleanupErrors = [...error.cleanupErrors]
          await mutationLock.close().catch((cleanupError) => cleanupErrors.push(cleanupError))
          await cleanupCreatedLaunchLock(path, error.identity, fileSystem).catch((cleanupError) =>
            cleanupErrors.push(cleanupError)
          )
          if (cleanupErrors.length === 0) throw error.creationError
          throw new AggregateError(
            [error.creationError, ...cleanupErrors],
            'Terminal Provider launch lock initialization rollback failed.'
          )
        }
        mutationHandoffStarted = true
        return finalizeProviderLaunchLockAcquisition(mutationLock, lease)
      }

      const ageMs = getLaunchLockAgeMs(snapshot)
      let shouldReclaim = false
      if (!snapshot.record) {
        if (
          !initializationObservation ||
          !isSameLaunchLockSnapshot(initializationObservation.snapshot, snapshot)
        ) {
          initializationObservation = {
            deadlineMs:
              performance.now() + Math.max(0, providerLaunchLockInitializationGraceMs - ageMs),
            snapshot
          }
        }
        initializationDelayMs = Math.max(
          0,
          initializationObservation.deadlineMs - performance.now()
        )
        shouldReclaim = initializationDelayMs === 0
      } else {
        const ownerState = await observeProviderLaunchLockOwner(snapshot.record)
        if (ownerState === 'dead') {
          shouldReclaim = true
        } else if (!('ownerId' in snapshot.record)) {
          return null
        } else if (getLaunchLockAgeMs(snapshot) < providerLaunchLockStaleAfterMs) {
          return null
        } else {
          // The launch heartbeat remains the final lease boundary for hung or legacy owners.
          shouldReclaim = true
        }
      }
      if (shouldReclaim) {
        initializationObservation = null
        const current = await readLaunchLockSnapshot(path, fileSystem)
        if (current && isSameLaunchLockSnapshot(current, snapshot)) {
          await mutationLock.assertOwned()
          await fileSystem.rm(path, { force: true })
          await mutationLock.assertOwned()
        }
      }
    } finally {
      if (!mutationHandoffStarted) await mutationLock.close()
    }
    if (initializationDelayMs > 0) {
      await delayProviderOperation(initializationDelayMs)
    }
  }
}

async function finalizeProviderLaunchLockAcquisition(
  mutationLock: FileSystemMutationLockLease,
  lease: ProviderLaunchLockLease
): Promise<ProviderLaunchLockLease> {
  try {
    await mutationLock.assertOwned()
    await lease.assertOwned()
    await mutationLock.assertOwned()
    await mutationLock.close()
    return lease
  } catch (error) {
    const cleanupErrors: unknown[] = []
    await mutationLock.close().catch((cleanupError) => cleanupErrors.push(cleanupError))
    await lease.close().catch((cleanupError) => cleanupErrors.push(cleanupError))
    if (cleanupErrors.length === 0) throw error
    throw new AggregateError(
      [error, ...cleanupErrors],
      'Terminal Provider launch lock acquisition rollback failed.'
    )
  }
}

function acquireProviderLaunchMutationLock(
  path: string,
  fileSystem: FileSystemMutationLockFileSystem
) {
  return acquireFileSystemMutationLock({
    directory: `${path}${providerLaunchLockMutationGuardSuffix}`,
    fileSystem,
    isProcessAlive: isProviderProcessAlive
  })
}

export function delayProviderOperation(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

export async function runWithProviderLaunchLock<T>(
  launchLock: ProviderLaunchLockLease,
  operation: (assertLeaseHealthy: () => Promise<void>) => Promise<T>,
  onRefreshError?: (error: unknown) => void
): Promise<T> {
  let refresh: Promise<void> | null = null
  let refreshError: unknown
  const timer = setInterval(() => {
    if (refresh) return
    refresh = launchLock
      .refresh()
      .catch((error) => {
        refreshError ??= error
        onRefreshError?.(error)
      })
      .finally(() => {
        refresh = null
      })
  }, providerLaunchLockRefreshIntervalMs)
  timer.unref()
  const assertLeaseHealthy = async (): Promise<void> => {
    await refresh
    if (refreshError) throw refreshError
    await launchLock.assertOwned()
  }
  try {
    return await operation(assertLeaseHealthy)
  } finally {
    clearInterval(timer)
    await refresh
    await launchLock.close()
  }
}

function getNodeErrorCode(error: unknown): string | null {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : null
}

async function createLaunchLock(
  path: string,
  fileSystem: FileSystemMutationLockFileSystem
): Promise<ProviderLaunchLockLease> {
  const epochLease = await createProcessEpochLease()
  let handle: FileHandle
  try {
    handle = await fileSystem.open(path, 'wx', 0o600)
  } catch (error) {
    await epochLease.close().catch(() => undefined)
    throw error
  }
  let identity: CreatedProviderLaunchLockIdentity | null = null
  const record: ProviderLaunchLockRecord = {
    schemaVersion: 1,
    ownerId: randomUUID(),
    processId: process.pid,
    acquiredAt: new Date().toISOString(),
    processEpoch: epochLease.reference
  }
  try {
    const openedFileStat = await handle.stat()
    identity = {
      device: openedFileStat.dev,
      inode: openedFileStat.ino,
      ownerId: record.ownerId
    }
    await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8')
    await handle.sync()
    const fileStat = await handle.stat()
    return createFileProviderLaunchLockLease({
      assertOwned: () =>
        assertLaunchLockAndEpochOwned(
          path,
          record.ownerId,
          fileStat.dev,
          fileStat.ino,
          fileSystem,
          epochLease
        ),
      handle,
      ownerId: record.ownerId,
      processEpoch: record.processEpoch,
      release: () => releaseLaunchLockAndEpoch(path, record.ownerId, fileSystem, epochLease),
      runRefresh: (operation) => runWithProviderLaunchMutationLock(path, fileSystem, operation)
    })
  } catch (error) {
    const cleanupErrors: unknown[] = []
    if (!identity) {
      try {
        const openedFileStat = await handle.stat()
        identity = {
          device: openedFileStat.dev,
          inode: openedFileStat.ino,
          ownerId: record.ownerId
        }
      } catch (identityError) {
        cleanupErrors.push(identityError)
      }
    }
    await handle.close().catch((cleanupError) => cleanupErrors.push(cleanupError))
    await epochLease.close().catch((cleanupError) => cleanupErrors.push(cleanupError))
    if (!identity) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Terminal Provider launch lock identity could not be recovered.'
      )
    }
    throw new ProviderLaunchLockCreationError(error, identity, cleanupErrors)
  }
}

async function runWithProviderLaunchMutationLock<T>(
  path: string,
  fileSystem: FileSystemMutationLockFileSystem,
  operation: () => Promise<T>
): Promise<T> {
  const mutationLock = await acquireProviderLaunchMutationLock(path, fileSystem)
  try {
    await mutationLock.assertOwned()
    const result = await operation()
    await mutationLock.assertOwned()
    return result
  } finally {
    await mutationLock.close()
  }
}

async function cleanupCreatedLaunchLock(
  path: string,
  identity: CreatedProviderLaunchLockIdentity,
  fileSystem: FileSystemMutationLockFileSystem
): Promise<void> {
  const deadline = Date.now() + 30_000
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const mutationLock = await acquireProviderLaunchMutationLock(path, fileSystem)
      try {
        await mutationLock.assertOwned()
        const current = await readLaunchLockSnapshot(path, fileSystem)
        if (
          current &&
          current.device === identity.device &&
          current.inode === identity.inode &&
          (!current.record ||
            ('ownerId' in current.record && current.record.ownerId === identity.ownerId))
        ) {
          await fileSystem.rm(path, { force: true })
          await mutationLock.assertOwned()
        }
        return
      } finally {
        await mutationLock.close()
      }
    } catch (error) {
      if (!isTransientProviderLockError(error)) throw error
      lastError = error
      await delayProviderOperation(25)
    }
  }
  throw new Error('Timed out rolling back Terminal Provider launch lock initialization.', {
    cause: lastError
  })
}

async function readLaunchLockSnapshot(
  path: string,
  fileSystem: FileSystemMutationLockFileSystem
): Promise<ProviderLaunchLockSnapshot | null> {
  const initialStat = await statProviderPathIfExists(path, fileSystem)
  if (!initialStat) return null
  let content: string
  try {
    content = await fileSystem.readFile(path, 'utf8')
  } catch (error) {
    if (isMissingProviderPathError(error)) return null
    throw error
  }
  const fileStat = await statProviderPathIfExists(path, fileSystem)
  if (!fileStat || fileStat.dev !== initialStat.dev || fileStat.ino !== initialStat.ino) {
    return null
  }
  let record: ProviderLaunchLockSnapshot['record'] = null
  try {
    record = readLaunchLockRecord(JSON.parse(content) as unknown)
  } catch {
    record = null
  }
  return {
    contentFingerprint: createHash('sha256').update(content).digest('hex'),
    device: fileStat.dev,
    inode: fileStat.ino,
    modifiedAtMs: fileStat.mtimeMs,
    record,
    size: fileStat.size
  }
}

async function statProviderPathIfExists(
  path: string,
  fileSystem: FileSystemMutationLockFileSystem
) {
  try {
    return await fileSystem.stat(path)
  } catch (error) {
    if (isMissingProviderPathError(error)) return null
    throw error
  }
}

function isMissingProviderPathError(error: unknown): boolean {
  return ['ENOENT', 'ENOTDIR'].includes(getNodeErrorCode(error) ?? '')
}

function getLaunchLockAgeMs(snapshot: ProviderLaunchLockSnapshot): number {
  const now = Date.now()
  if (snapshot.modifiedAtMs > now + providerLaunchLockRefreshIntervalMs) {
    return providerLaunchLockStaleAfterMs
  }
  return Math.max(0, now - snapshot.modifiedAtMs)
}

function readLaunchLockRecord(
  value: unknown
): ProviderLaunchLockRecord | LegacyProviderLaunchLockRecord | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('processId' in value) ||
    typeof value.processId !== 'number'
  ) {
    return null
  }
  if (
    'schemaVersion' in value &&
    value.schemaVersion === 1 &&
    'ownerId' in value &&
    typeof value.ownerId === 'string' &&
    'acquiredAt' in value &&
    typeof value.acquiredAt === 'string'
  ) {
    return {
      schemaVersion: 1,
      ownerId: value.ownerId,
      processId: value.processId,
      acquiredAt: value.acquiredAt,
      ...('processEpoch' in value && isProcessEpochReference(value.processEpoch)
        ? { processEpoch: value.processEpoch }
        : {})
    }
  }
  return { processId: value.processId }
}

async function observeProviderLaunchLockOwner(
  record: ProviderLaunchLockRecord | LegacyProviderLaunchLockRecord
): Promise<ProcessEpochObservation | 'legacy-alive'> {
  if (!isProviderProcessAlive(record.processId)) return 'dead'
  if (!('processEpoch' in record) || !record.processEpoch) return 'legacy-alive'
  return observeProcessEpoch(record.processEpoch)
}

function isSameLaunchLockSnapshot(
  current: ProviderLaunchLockSnapshot,
  expected: ProviderLaunchLockSnapshot
): boolean {
  if (
    current.contentFingerprint !== expected.contentFingerprint ||
    current.device !== expected.device ||
    current.inode !== expected.inode ||
    current.modifiedAtMs !== expected.modifiedAtMs ||
    current.size !== expected.size
  ) {
    return false
  }
  if (!current.record || !expected.record) return current.record === expected.record
  if ('ownerId' in current.record || 'ownerId' in expected.record) {
    return (
      'ownerId' in current.record &&
      'ownerId' in expected.record &&
      current.record.ownerId === expected.record.ownerId
    )
  }
  return current.record.processId === expected.record.processId
}

async function assertLaunchLockOwned(
  path: string,
  ownerId: string,
  device: number,
  inode: number,
  fileSystem: FileSystemMutationLockFileSystem
): Promise<void> {
  const current = await readLaunchLockSnapshot(path, fileSystem)
  if (
    !current ||
    current.device !== device ||
    current.inode !== inode ||
    !current.record ||
    !('ownerId' in current.record) ||
    current.record.ownerId !== ownerId
  ) {
    throw new Error('Terminal Provider launch lock ownership was lost.')
  }
}

async function assertLaunchLockAndEpochOwned(
  path: string,
  ownerId: string,
  device: number,
  inode: number,
  fileSystem: FileSystemMutationLockFileSystem,
  epochLease: ProcessEpochLease
): Promise<void> {
  await epochLease.assertActive()
  await assertLaunchLockOwned(path, ownerId, device, inode, fileSystem)
}

async function releaseLaunchLock(
  path: string,
  ownerId: string,
  fileSystem: FileSystemMutationLockFileSystem
): Promise<void> {
  const deadline = Date.now() + 30_000
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const mutationLock = await acquireProviderLaunchMutationLock(path, fileSystem)
      try {
        await mutationLock.assertOwned()
        const current = await readLaunchLockSnapshot(path, fileSystem)
        if (current?.record && 'ownerId' in current.record && current.record.ownerId === ownerId) {
          await fileSystem.rm(path, { force: true })
          await mutationLock.assertOwned()
        }
        return
      } finally {
        await mutationLock.close()
      }
    } catch (error) {
      if (!isTransientProviderLockError(error)) throw error
      lastError = error
      await delayProviderOperation(25)
    }
  }
  throw new Error('Timed out releasing Terminal Provider launch lock.', { cause: lastError })
}

async function releaseLaunchLockAndEpoch(
  path: string,
  ownerId: string,
  fileSystem: FileSystemMutationLockFileSystem,
  epochLease: ProcessEpochLease
): Promise<void> {
  const errors: unknown[] = []
  await releaseLaunchLock(path, ownerId, fileSystem).catch((error) => errors.push(error))
  await epochLease.close().catch((error) => errors.push(error))
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) {
    throw new AggregateError(errors, 'Terminal Provider launch lock release was incomplete.')
  }
}

function isTransientProviderLockError(error: unknown): boolean {
  return ['EACCES', 'EBUSY', 'EMFILE', 'ENFILE', 'EPERM'].includes(getNodeErrorCode(error) ?? '')
}
