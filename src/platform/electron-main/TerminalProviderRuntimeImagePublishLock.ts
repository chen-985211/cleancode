import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  acquireFileSystemMutationLock,
  type FileSystemMutationLockFileSystem,
  type FileSystemMutationLockLease
} from '../../contexts/run/infrastructure/provider/FileSystemMutationLock'
import {
  createProcessEpochLease,
  isProcessEpochReference,
  observeProcessEpoch,
  type ProcessEpochLease,
  type ProcessEpochReference
} from '../../contexts/run/infrastructure/provider/ProcessEpochLiveness'

export interface RuntimeImagePublishLockFileSystem extends Omit<
  FileSystemMutationLockFileSystem,
  'open'
> {
  open(path: string, flags: 'w' | 'wx', mode: number): Promise<FileHandle>
}

export interface RuntimeImagePublishLockOptions {
  readonly fileSystem?: RuntimeImagePublishLockFileSystem
}

interface RuntimeImagePublishLockRecord {
  readonly schemaVersion: 1
  readonly ownerId: string
  readonly processId: number
  readonly acquiredAt: string
  readonly processEpoch?: ProcessEpochReference
}

interface RuntimeImagePublishLockSnapshot {
  readonly device: number
  readonly inode: number
  readonly modifiedAtMs: number
  readonly record: RuntimeImagePublishLockRecord | null
}

interface CreatedRuntimeImagePublishLockIdentity {
  readonly device: number
  readonly inode: number
  readonly ownerId: string
}

class RuntimeImagePublishLockCreationError extends Error {
  constructor(
    readonly creationError: unknown,
    readonly identity: CreatedRuntimeImagePublishLockIdentity
  ) {
    super('Terminal Provider runtime image publish lock initialization failed.', {
      cause: creationError
    })
  }
}

const publishLockOwnerName = 'owner.json'
const publishLockHeartbeatName = '.heartbeat'
const publishLockWaitTimeoutMs = 30_000
const publishLockInitializationGraceMs = 250
const publishLockRefreshIntervalMs = 5_000
const publishLockStaleAfterMs = 30_000
const publishLockMutationGuardSuffix = '.reclaim-guard'
const nodePublishLockFileSystem: RuntimeImagePublishLockFileSystem = {
  mkdir,
  open: (path, flags, mode) => open(path, flags, mode),
  readFile,
  readdir,
  rename,
  rm,
  stat
}

export async function acquireRuntimeImagePublishLock(
  root: string,
  imageKey: string,
  isAlive: (processId: number) => boolean,
  options: RuntimeImagePublishLockOptions = {}
): Promise<RuntimeImagePublishLockLease> {
  const fileSystem = options.fileSystem ?? nodePublishLockFileSystem
  const lockDirectory = join(root, `${imageKey}.publish-lock`)
  const deadline = Date.now() + publishLockWaitTimeoutMs
  let initializationObservation: {
    readonly deadlineMs: number
    readonly snapshot: RuntimeImagePublishLockSnapshot
  } | null = null
  while (true) {
    if (Date.now() >= deadline) throw publishLockTimeout(imageKey)
    const mutationLock = await acquirePublishLockMutationLock(lockDirectory, isAlive, fileSystem)
    let waitDurationMs = 0
    let mutationHandoffStarted = false
    try {
      await mutationLock.assertOwned()
      const snapshot = await readPublishLockSnapshot(fileSystem, lockDirectory)
      if (!snapshot) {
        let lease: RuntimeImagePublishLockLease
        try {
          lease = await createPublishLockLease(fileSystem, lockDirectory, isAlive)
        } catch (error) {
          if (!(error instanceof RuntimeImagePublishLockCreationError)) throw error
          mutationHandoffStarted = true
          const cleanupErrors: unknown[] = []
          await mutationLock.close().catch((cleanupError) => cleanupErrors.push(cleanupError))
          await cleanupCreatedPublishLock(fileSystem, lockDirectory, error.identity, isAlive).catch(
            (cleanupError) => cleanupErrors.push(cleanupError)
          )
          if (cleanupErrors.length === 0) throw error.creationError
          throw new AggregateError(
            [error.creationError, ...cleanupErrors],
            'Terminal Provider runtime image publish lock initialization rollback failed.'
          )
        }
        mutationHandoffStarted = true
        return finalizePublishLockAcquisition(mutationLock, lease)
      }

      const ageMs = snapshot.record
        ? getPublishLockAgeMs(snapshot)
        : Math.max(0, Date.now() - snapshot.modifiedAtMs)
      let shouldReclaim = false
      if (!snapshot.record) {
        if (
          !initializationObservation ||
          !isSamePublishLockSnapshot(initializationObservation.snapshot, snapshot)
        ) {
          initializationObservation = {
            deadlineMs: performance.now() + Math.max(0, publishLockInitializationGraceMs - ageMs),
            snapshot
          }
        }
        waitDurationMs = Math.max(0, initializationObservation.deadlineMs - performance.now())
        shouldReclaim = waitDurationMs === 0
      } else {
        initializationObservation = null
        const ownerState = await observePublishLockOwner(snapshot.record, isAlive)
        if (ownerState === 'dead' || ageMs >= publishLockStaleAfterMs) {
          shouldReclaim = true
        } else {
          waitDurationMs = 25
        }
      }
      if (shouldReclaim) {
        initializationObservation = null
        const current = await readPublishLockSnapshot(fileSystem, lockDirectory)
        if (current && isSamePublishLockSnapshot(current, snapshot)) {
          await mutationLock.assertOwned()
          await fileSystem.rm(lockDirectory, { force: true, recursive: true })
          await mutationLock.assertOwned()
        }
      }
    } finally {
      if (!mutationHandoffStarted) await mutationLock.close()
    }

    const remainingDurationMs = deadline - Date.now()
    if (remainingDurationMs <= 0) throw publishLockTimeout(imageKey)
    if (waitDurationMs > 0) await delay(Math.min(waitDurationMs, remainingDurationMs))
  }
}

async function finalizePublishLockAcquisition(
  mutationLock: FileSystemMutationLockLease,
  lease: RuntimeImagePublishLockLease
): Promise<RuntimeImagePublishLockLease> {
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
      'Terminal Provider runtime image publish lock acquisition rollback failed.'
    )
  }
}

async function createPublishLockLease(
  fileSystem: RuntimeImagePublishLockFileSystem,
  lockDirectory: string,
  isAlive: (processId: number) => boolean
): Promise<RuntimeImagePublishLockLease> {
  await fileSystem.mkdir(lockDirectory)
  const createdDirectory = await fileSystem.stat(lockDirectory)
  const epochLease = await createProcessEpochLease().catch(async (error) => {
    await fileSystem.rm(lockDirectory, { force: true, recursive: true })
    throw error
  })
  const record: RuntimeImagePublishLockRecord = {
    schemaVersion: 1,
    ownerId: randomUUID(),
    processId: process.pid,
    acquiredAt: new Date().toISOString(),
    processEpoch: epochLease.reference
  }
  try {
    await writeSynchronizedFile(
      fileSystem,
      join(lockDirectory, publishLockOwnerName),
      `${JSON.stringify(record)}\n`,
      'wx'
    )
    await writeSynchronizedFile(
      fileSystem,
      join(lockDirectory, publishLockHeartbeatName),
      `${record.acquiredAt}\n`,
      'wx'
    )
    const snapshot = await readPublishLockSnapshot(fileSystem, lockDirectory)
    if (!snapshot || snapshot.record?.ownerId !== record.ownerId) {
      throw new Error('Terminal Provider runtime image publish lock was not initialized.')
    }
    return new RuntimeImagePublishLockLease(
      fileSystem,
      lockDirectory,
      snapshot,
      isAlive,
      epochLease
    )
  } catch (error) {
    await epochLease.close().catch(() => undefined)
    throw new RuntimeImagePublishLockCreationError(error, {
      device: createdDirectory.dev,
      inode: createdDirectory.ino,
      ownerId: record.ownerId
    })
  }
}

async function cleanupCreatedPublishLock(
  fileSystem: RuntimeImagePublishLockFileSystem,
  lockDirectory: string,
  identity: CreatedRuntimeImagePublishLockIdentity,
  isAlive: (processId: number) => boolean
): Promise<void> {
  const deadline = Date.now() + publishLockWaitTimeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const mutationLock = await acquirePublishLockMutationLock(lockDirectory, isAlive, fileSystem)
      try {
        await mutationLock.assertOwned()
        const current = await readPublishLockSnapshot(fileSystem, lockDirectory)
        if (
          current &&
          current.device === identity.device &&
          current.inode === identity.inode &&
          (!current.record || current.record.ownerId === identity.ownerId)
        ) {
          await fileSystem.rm(lockDirectory, { force: true, recursive: true })
          await mutationLock.assertOwned()
        }
        return
      } finally {
        await mutationLock.close()
      }
    } catch (error) {
      if (!isTransientPublishLockError(error)) throw error
      lastError = error
      await delay(25)
    }
  }
  throw new Error(
    'Timed out rolling back Terminal Provider runtime image publish lock initialization.',
    { cause: lastError }
  )
}

export class RuntimeImagePublishLockLease {
  private closePromise: Promise<void> | null = null
  private isClosed = false
  private refreshError: unknown
  private refresh: Promise<void> | null = null
  private readonly timer: NodeJS.Timeout

  constructor(
    private readonly fileSystem: RuntimeImagePublishLockFileSystem,
    private readonly directory: string,
    private readonly ownedSnapshot: RuntimeImagePublishLockSnapshot,
    private readonly isAlive: (processId: number) => boolean,
    private readonly epochLease: ProcessEpochLease
  ) {
    this.timer = setInterval(() => this.scheduleRefresh(), publishLockRefreshIntervalMs)
    this.timer.unref()
  }

  async assertOwned(): Promise<void> {
    if (this.isClosed || this.closePromise) {
      throw new Error('Terminal Provider runtime image publish lock is already closed.')
    }
    await this.epochLease.assertActive()
    await this.refresh
    if (this.refreshError) throw this.refreshError
    await this.assertCurrentOwner()
  }

  async close(): Promise<void> {
    if (this.isClosed) return
    if (this.closePromise) return this.closePromise
    clearInterval(this.timer)
    this.closePromise = this.release()
    try {
      await this.closePromise
      this.isClosed = true
    } finally {
      this.closePromise = null
    }
  }

  private async release(): Promise<void> {
    await this.refresh?.catch(() => undefined)
    const errors: unknown[] = []
    const deadline = Date.now() + publishLockWaitTimeoutMs
    let lastError: unknown
    let releaseCompleted = false
    while (Date.now() < deadline) {
      try {
        const mutationLock = await acquirePublishLockMutationLock(
          this.directory,
          this.isAlive,
          this.fileSystem
        )
        try {
          await mutationLock.assertOwned()
          const current = await readPublishLockSnapshot(this.fileSystem, this.directory)
          if (current && isSamePublishLockOwner(current, this.ownedSnapshot)) {
            await this.fileSystem.rm(this.directory, { force: true, recursive: true })
            await mutationLock.assertOwned()
          }
          releaseCompleted = true
          break
        } finally {
          await mutationLock.close()
        }
      } catch (error) {
        if (!isTransientPublishLockError(error)) throw error
        lastError = error
        await delay(25)
      }
    }
    if (!releaseCompleted) {
      errors.push(
        new Error('Timed out releasing terminal Provider runtime image publish lock.', {
          cause: lastError
        })
      )
    }
    await this.epochLease.close().catch((error) => errors.push(error))
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) {
      throw new AggregateError(
        errors,
        'Terminal Provider runtime image publish lock release was incomplete.'
      )
    }
  }

  private scheduleRefresh(): void {
    if (this.refresh || this.refreshError) return
    this.refresh = this.refreshNow()
      .catch((error) => {
        this.refreshError = error
      })
      .finally(() => {
        this.refresh = null
      })
  }

  private async refreshNow(): Promise<void> {
    const mutationLock = await acquirePublishLockMutationLock(
      this.directory,
      this.isAlive,
      this.fileSystem
    )
    try {
      await mutationLock.assertOwned()
      await this.assertCurrentOwner()
      await writeSynchronizedFile(
        this.fileSystem,
        join(this.directory, publishLockHeartbeatName),
        `${new Date().toISOString()}\n`,
        'w'
      )
      await this.assertCurrentOwner()
      await mutationLock.assertOwned()
    } finally {
      await mutationLock.close()
    }
  }

  private async assertCurrentOwner(): Promise<void> {
    await this.epochLease.assertActive()
    const current = await readPublishLockSnapshot(this.fileSystem, this.directory)
    if (!current || !isSamePublishLockOwner(current, this.ownedSnapshot)) {
      throw new Error('Terminal Provider runtime image publish lock ownership was lost.')
    }
  }
}

function acquirePublishLockMutationLock(
  lockDirectory: string,
  isAlive: (processId: number) => boolean,
  fileSystem: RuntimeImagePublishLockFileSystem
) {
  return acquireFileSystemMutationLock({
    directory: `${lockDirectory}${publishLockMutationGuardSuffix}`,
    fileSystem,
    isProcessAlive: isAlive
  })
}

async function readPublishLockSnapshot(
  fileSystem: RuntimeImagePublishLockFileSystem,
  directory: string
): Promise<RuntimeImagePublishLockSnapshot | null> {
  const directoryStat = await statPublishPathIfExists(fileSystem, directory)
  if (!directoryStat?.isDirectory()) return null
  const ownerPath = join(directory, publishLockOwnerName)
  const record = await readPublishLockRecord(fileSystem, ownerPath)
  const heartbeatStat = await statPublishPathIfExists(
    fileSystem,
    join(directory, publishLockHeartbeatName)
  )
  const ownerStat = await statPublishPathIfExists(fileSystem, ownerPath)
  const confirmedDirectoryStat = await statPublishPathIfExists(fileSystem, directory)
  if (
    !confirmedDirectoryStat?.isDirectory() ||
    confirmedDirectoryStat.dev !== directoryStat.dev ||
    confirmedDirectoryStat.ino !== directoryStat.ino
  ) {
    return null
  }
  return {
    device: directoryStat.dev,
    inode: directoryStat.ino,
    modifiedAtMs: heartbeatStat?.mtimeMs ?? ownerStat?.mtimeMs ?? directoryStat.mtimeMs,
    record
  }
}

async function readPublishLockRecord(
  fileSystem: RuntimeImagePublishLockFileSystem,
  path: string
): Promise<RuntimeImagePublishLockRecord | null> {
  let contents: string
  try {
    contents = await fileSystem.readFile(path, 'utf8')
  } catch (error) {
    if (isMissingPublishPathError(error)) return null
    throw error
  }
  try {
    const value: unknown = JSON.parse(contents)
    if (
      typeof value === 'object' &&
      value !== null &&
      'schemaVersion' in value &&
      value.schemaVersion === 1 &&
      'ownerId' in value &&
      typeof value.ownerId === 'string' &&
      'processId' in value &&
      typeof value.processId === 'number' &&
      'acquiredAt' in value &&
      typeof value.acquiredAt === 'string' &&
      (!('processEpoch' in value) || isProcessEpochReference(value.processEpoch))
    ) {
      return value as RuntimeImagePublishLockRecord
    }
  } catch {
    // Missing or corrupt owners are reclaimed after the initialization grace period.
  }
  return null
}

async function observePublishLockOwner(
  record: RuntimeImagePublishLockRecord,
  isAlive: (processId: number) => boolean
): Promise<'alive' | 'dead' | 'unknown'> {
  try {
    if (!isAlive(record.processId)) return 'dead'
  } catch {
    return 'unknown'
  }
  if (!record.processEpoch) return 'alive'
  return observeProcessEpoch(record.processEpoch)
}

function getPublishLockAgeMs(snapshot: RuntimeImagePublishLockSnapshot): number {
  const now = Date.now()
  if (snapshot.modifiedAtMs > now + publishLockRefreshIntervalMs) {
    return publishLockStaleAfterMs
  }
  return Math.max(0, now - snapshot.modifiedAtMs)
}

async function statPublishPathIfExists(
  fileSystem: RuntimeImagePublishLockFileSystem,
  path: string
) {
  try {
    return await fileSystem.stat(path)
  } catch (error) {
    if (isMissingPublishPathError(error)) return null
    throw error
  }
}

function isMissingPublishPathError(error: unknown): boolean {
  return ['ENOENT', 'ENOTDIR'].includes(getPublishErrorCode(error) ?? '')
}

function getPublishErrorCode(error: unknown): string | null {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : null
}

function isSamePublishLockSnapshot(
  first: RuntimeImagePublishLockSnapshot,
  second: RuntimeImagePublishLockSnapshot
): boolean {
  return (
    first.device === second.device &&
    first.inode === second.inode &&
    first.modifiedAtMs === second.modifiedAtMs &&
    ((first.record === null && second.record === null) || isSamePublishLockOwner(first, second))
  )
}

function isSamePublishLockOwner(
  first: RuntimeImagePublishLockSnapshot,
  second: RuntimeImagePublishLockSnapshot
): boolean {
  return (
    first.device === second.device &&
    first.inode === second.inode &&
    first.record !== null &&
    second.record !== null &&
    first.record.ownerId === second.record.ownerId
  )
}

async function writeSynchronizedFile(
  fileSystem: RuntimeImagePublishLockFileSystem,
  path: string,
  contents: string,
  flags: 'w' | 'wx'
): Promise<void> {
  const handle = await fileSystem.open(path, flags, 0o600)
  try {
    await handle.writeFile(contents, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

function publishLockTimeout(imageKey: string): Error {
  return new Error(`Timed out waiting to publish terminal Provider runtime image ${imageKey}.`)
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

function isTransientPublishLockError(error: unknown): boolean {
  return ['EACCES', 'EBUSY', 'EMFILE', 'ENFILE', 'EPERM'].includes(getPublishErrorCode(error) ?? '')
}
