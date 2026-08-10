import { randomUUID } from 'node:crypto'
import type { Dirent, Stats } from 'node:fs'
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  createProcessEpochLease,
  isProcessEpochReference,
  observeProcessEpoch,
  type ProcessEpochLease,
  type ProcessEpochReference
} from './ProcessEpochLiveness'

interface FileSystemMutationLockRecord {
  readonly schemaVersion: 1
  readonly ownerId: string
  readonly processId: number
  readonly acquiredAt: string
  readonly processEpoch?: ProcessEpochReference
}

interface FileSystemMutationLockSnapshot {
  readonly device: number
  readonly inode: number
  readonly modifiedAtMs: number
  readonly record: FileSystemMutationLockRecord | null
}

interface FileSystemMutationLockCandidate {
  readonly directory: string
  readonly epochLease: ProcessEpochLease
  readonly snapshot: FileSystemMutationLockSnapshot
}

export interface FileSystemMutationLockLease {
  assertOwned(): Promise<void>
  close(): Promise<void>
}

export interface FileSystemMutationLockFileSystem {
  mkdir(path: string): Promise<unknown>
  open(path: string, flags: 'wx', mode: number): Promise<FileHandle>
  readFile(path: string, encoding: 'utf8'): Promise<string>
  readdir(path: string, options: { readonly withFileTypes: true }): Promise<Dirent[]>
  rename(source: string, destination: string): Promise<void>
  rm(path: string, options: { readonly force: true; readonly recursive?: boolean }): Promise<void>
  stat(path: string): Promise<Stats>
}

export interface FileSystemMutationLockOptions {
  readonly directory: string
  readonly fileSystem?: FileSystemMutationLockFileSystem
  readonly isProcessAlive: (processId: number) => boolean
  readonly timeoutMs?: number
}

interface ResolvedFileSystemMutationLockOptions extends FileSystemMutationLockOptions {
  readonly fileSystem: FileSystemMutationLockFileSystem
}

type CorruptLockObservations = Map<
  string,
  { readonly deadlineMs: number; readonly snapshot: FileSystemMutationLockSnapshot }
>

const ownerFileName = 'owner.json'
const reclaimSuffix = '.reclaiming'
const reclaimedSuffix = '.reclaimed-'
const candidateSuffix = '.candidate-'
const initializationGraceMs = 250
const defaultTimeoutMs = 30_000
const retryDelayMs = 25
const nodeFileSystem: FileSystemMutationLockFileSystem = {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat
}

export async function acquireFileSystemMutationLock(
  options: FileSystemMutationLockOptions
): Promise<FileSystemMutationLockLease> {
  const resolvedOptions: ResolvedFileSystemMutationLockOptions = {
    ...options,
    fileSystem: options.fileSystem ?? nodeFileSystem
  }
  const deadline = Date.now() + (resolvedOptions.timeoutMs ?? defaultTimeoutMs)
  const corruptObservations: CorruptLockObservations = new Map()
  let nextRetryDelayMs = retryDelayMs
  const waitForNextRetry = async (): Promise<void> => {
    await waitForRetry(deadline, resolvedOptions.directory, nextRetryDelayMs)
    nextRetryDelayMs = Math.min(250, nextRetryDelayMs * 2)
  }
  while (true) {
    await recoverReclaimBarrier(resolvedOptions, corruptObservations)
    if (await hasReclaimBarrier(resolvedOptions, resolvedOptions.directory)) {
      await waitForNextRetry()
      continue
    }

    const existing = await readLockSnapshot(resolvedOptions, resolvedOptions.directory)
    if (existing) {
      if (
        await shouldPreserveMutationLockSnapshot(
          resolvedOptions,
          corruptObservations,
          resolvedOptions.directory,
          existing
        )
      ) {
        await waitForNextRetry()
        continue
      }
      if (!(await claimAndDeleteSnapshot(resolvedOptions, resolvedOptions.directory, existing))) {
        await waitForNextRetry()
      }
      continue
    }

    const candidate = await createLockCandidate(resolvedOptions)
    try {
      await resolvedOptions.fileSystem.rename(candidate.directory, resolvedOptions.directory)
    } catch (error) {
      await resolvedOptions.fileSystem.rm(candidate.directory, { force: true, recursive: true })
      await candidate.epochLease.close()
      if (!isExistingTargetError(error)) throw error
      const snapshot = await readLockSnapshot(resolvedOptions, resolvedOptions.directory)
      if (!snapshot) {
        await waitForNextRetry()
        continue
      }
      if (
        await shouldPreserveMutationLockSnapshot(
          resolvedOptions,
          corruptObservations,
          resolvedOptions.directory,
          snapshot
        )
      ) {
        await waitForNextRetry()
        continue
      }
      if (!(await claimAndDeleteSnapshot(resolvedOptions, resolvedOptions.directory, snapshot))) {
        await waitForNextRetry()
      }
      continue
    }

    const lease = new DirectoryMutationLockLease(
      resolvedOptions,
      candidate.snapshot,
      candidate.epochLease
    )
    try {
      await lease.assertOwned()
      return lease
    } catch {
      await lease.close()
      await waitForNextRetry()
    }
  }
}

async function shouldPreserveMutationLockSnapshot(
  options: ResolvedFileSystemMutationLockOptions,
  corruptObservations: CorruptLockObservations,
  path: string,
  snapshot: FileSystemMutationLockSnapshot
): Promise<boolean> {
  if (snapshot.record) return isMutationLockOwnerAlive(options, snapshot.record)
  return !hasCorruptLockInitializationGraceElapsed(
    corruptObservations,
    path,
    snapshot,
    Date.now() - snapshot.modifiedAtMs
  )
}

class DirectoryMutationLockLease implements FileSystemMutationLockLease {
  private closePromise: Promise<void> | null = null
  private isClosed = false

  constructor(
    private readonly options: ResolvedFileSystemMutationLockOptions,
    private readonly snapshot: FileSystemMutationLockSnapshot,
    private readonly epochLease: ProcessEpochLease
  ) {}

  async assertOwned(): Promise<void> {
    if (this.isClosed || this.closePromise) throw ownershipLostError()
    await this.epochLease.assertActive()
    if (await hasReclaimBarrier(this.options, this.options.directory)) throw ownershipLostError()
    const current = await readLockSnapshot(this.options, this.options.directory)
    if (!current || !isSameOwner(current, this.snapshot)) throw ownershipLostError()
    if (await hasReclaimBarrier(this.options, this.options.directory)) throw ownershipLostError()
  }

  async close(): Promise<void> {
    if (this.isClosed) return
    if (this.closePromise) return this.closePromise
    this.closePromise = this.release()
    try {
      await this.closePromise
      this.isClosed = true
    } finally {
      this.closePromise = null
    }
  }

  private async release(): Promise<void> {
    const errors: unknown[] = []
    try {
      const deadline = Date.now() + defaultTimeoutMs
      let lastError: unknown
      while (Date.now() < deadline) {
        try {
          await moveFixedBarrierToUnique(this.options, this.options.directory)
          const current = await readLockSnapshot(this.options, this.options.directory)
          if (current && isSameOwner(current, this.snapshot)) {
            await claimAndDeleteSnapshot(this.options, this.options.directory, current)
          }
          await moveFixedBarrierToUnique(this.options, this.options.directory)
          for (const barrier of await listUniqueReclaimBarriers(
            this.options,
            this.options.directory
          )) {
            const claimed = await readLockSnapshot(this.options, barrier)
            if (claimed && isSameOwner(claimed, this.snapshot)) {
              await this.options.fileSystem.rm(barrier, { force: true, recursive: true })
            }
          }
          await moveFixedBarrierToUnique(this.options, this.options.directory)
          if (!(await ownerExistsAnywhere(this.options, this.options.directory, this.snapshot))) {
            break
          }
        } catch (error) {
          if (!isTransientLockFileSystemError(error)) throw error
          lastError = error
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      }
      if (await ownerExistsAnywhere(this.options, this.options.directory, this.snapshot)) {
        throw new Error(
          `Timed out releasing file-system mutation lock ${this.options.directory}.`,
          { cause: lastError }
        )
      }
    } catch (error) {
      errors.push(error)
    }
    await this.epochLease.close().catch((error) => errors.push(error))
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) {
      throw new AggregateError(errors, 'File-system mutation lock release was incomplete.')
    }
  }
}

async function createLockCandidate(
  options: ResolvedFileSystemMutationLockOptions
): Promise<FileSystemMutationLockCandidate> {
  const { directory, fileSystem } = options
  const candidateDirectory = `${directory}${candidateSuffix}${randomUUID()}`
  await fileSystem.mkdir(candidateDirectory)
  const epochLease = await createProcessEpochLease().catch(async (error) => {
    await fileSystem.rm(candidateDirectory, { force: true, recursive: true })
    throw error
  })
  const record: FileSystemMutationLockRecord = {
    schemaVersion: 1,
    ownerId: randomUUID(),
    processId: process.pid,
    acquiredAt: new Date().toISOString(),
    processEpoch: epochLease.reference
  }
  try {
    await writeSynchronizedFile(
      options,
      join(candidateDirectory, ownerFileName),
      `${JSON.stringify(record)}\n`
    )
    const snapshot = await readLockSnapshot(options, candidateDirectory)
    if (!snapshot || snapshot.record?.ownerId !== record.ownerId) {
      throw new Error('File-system mutation lock was not initialized.')
    }
    return { directory: candidateDirectory, epochLease, snapshot }
  } catch (error) {
    await fileSystem.rm(candidateDirectory, { force: true, recursive: true })
    await epochLease.close().catch(() => undefined)
    throw error
  }
}

async function recoverReclaimBarrier(
  options: ResolvedFileSystemMutationLockOptions,
  corruptObservations: CorruptLockObservations
): Promise<void> {
  await pruneAbandonedCandidates(options, corruptObservations)
  await moveFixedBarrierToUnique(options, options.directory)
  for (const barrier of await listUniqueReclaimBarriers(options, options.directory)) {
    const claimed = await readLockSnapshot(options, barrier)
    if (!claimed) {
      await options.fileSystem.rm(barrier, { force: true, recursive: true })
      continue
    }
    const claimedAgeMs = Date.now() - claimed.modifiedAtMs
    if (
      (!claimed.record &&
        hasCorruptLockInitializationGraceElapsed(
          corruptObservations,
          barrier,
          claimed,
          claimedAgeMs
        )) ||
      (claimed.record && !(await isMutationLockOwnerAlive(options, claimed.record)))
    ) {
      await options.fileSystem.rm(barrier, { force: true, recursive: true })
      continue
    }
    // Live owners stay in their unique barriers until they close or exit.
    // Restoring them would reintroduce a close-versus-recovery resurrection race.
  }
}

async function pruneAbandonedCandidates(
  options: ResolvedFileSystemMutationLockOptions,
  corruptObservations: CorruptLockObservations
): Promise<void> {
  for (const candidate of await listArtifactDirectories(
    options,
    options.directory,
    candidateSuffix
  )) {
    const snapshot = await readLockSnapshot(options, candidate)
    if (!snapshot) {
      await options.fileSystem.rm(candidate, { force: true, recursive: true })
      continue
    }
    const ageMs = Date.now() - snapshot.modifiedAtMs
    if (
      (snapshot.record && !(await isMutationLockOwnerAlive(options, snapshot.record))) ||
      (!snapshot.record &&
        hasCorruptLockInitializationGraceElapsed(corruptObservations, candidate, snapshot, ageMs))
    ) {
      await options.fileSystem.rm(candidate, { force: true, recursive: true })
    }
  }
}

function hasCorruptLockInitializationGraceElapsed(
  observations: CorruptLockObservations,
  path: string,
  snapshot: FileSystemMutationLockSnapshot,
  wallClockAgeMs: number
): boolean {
  if (wallClockAgeMs >= initializationGraceMs) return true
  const current = observations.get(path)
  if (!current || !isSameSnapshot(current.snapshot, snapshot)) {
    observations.set(path, {
      deadlineMs:
        performance.now() + Math.max(0, initializationGraceMs - Math.max(0, wallClockAgeMs)),
      snapshot
    })
    return false
  }
  return performance.now() >= current.deadlineMs
}

async function claimAndDeleteSnapshot(
  options: ResolvedFileSystemMutationLockOptions,
  directory: string,
  expected: FileSystemMutationLockSnapshot
): Promise<boolean> {
  const reclaimDirectory = getReclaimDirectory(directory)
  try {
    await options.fileSystem.rename(directory, reclaimDirectory)
  } catch (error) {
    if (isRetryableRenameError(error)) return false
    throw error
  }

  const uniqueBarrier = await moveFixedBarrierToUnique(options, directory)
  if (!uniqueBarrier) return false
  const claimed = await readLockSnapshot(options, uniqueBarrier)
  if (claimed && isSameSnapshot(claimed, expected)) {
    await options.fileSystem.rm(uniqueBarrier, { force: true, recursive: true })
    return true
  }
  return false
}

async function moveFixedBarrierToUnique(
  options: ResolvedFileSystemMutationLockOptions,
  directory: string
): Promise<string | null> {
  const reclaimDirectory = getReclaimDirectory(directory)
  const uniqueBarrier = `${directory}${reclaimedSuffix}${randomUUID()}`
  try {
    await options.fileSystem.rename(reclaimDirectory, uniqueBarrier)
    return uniqueBarrier
  } catch (error) {
    if (isRetryableRenameError(error)) return null
    throw error
  }
}

async function readLockSnapshot(
  options: ResolvedFileSystemMutationLockOptions,
  directory: string
): Promise<FileSystemMutationLockSnapshot | null> {
  const directoryStat = await statIfExists(options, directory)
  if (!directoryStat?.isDirectory()) return null
  const record = await readLockRecord(options, join(directory, ownerFileName))
  const ownerStat = await statIfExists(options, join(directory, ownerFileName))
  const confirmedDirectoryStat = await statIfExists(options, directory)
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
    modifiedAtMs: ownerStat?.mtimeMs ?? directoryStat.mtimeMs,
    record
  }
}

async function readLockRecord(
  options: ResolvedFileSystemMutationLockOptions,
  path: string
): Promise<FileSystemMutationLockRecord | null> {
  let contents: string
  try {
    contents = await options.fileSystem.readFile(path, 'utf8')
  } catch (error) {
    if (isMissingPathError(error)) return null
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
      return value as FileSystemMutationLockRecord
    }
  } catch {
    // Missing/corrupt records are reclaimed after the initialization grace period.
  }
  return null
}

async function isMutationLockOwnerAlive(
  options: ResolvedFileSystemMutationLockOptions,
  record: FileSystemMutationLockRecord
): Promise<boolean> {
  if (!options.isProcessAlive(record.processId)) return false
  if (!record.processEpoch) return true
  const observation = await observeProcessEpoch(record.processEpoch)
  return observation !== 'dead'
}

function isSameSnapshot(
  first: FileSystemMutationLockSnapshot,
  second: FileSystemMutationLockSnapshot
): boolean {
  return (
    first.device === second.device &&
    first.inode === second.inode &&
    first.modifiedAtMs === second.modifiedAtMs &&
    ((first.record === null && second.record === null) || isSameOwner(first, second))
  )
}

function isSameOwner(
  first: FileSystemMutationLockSnapshot,
  second: FileSystemMutationLockSnapshot
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
  options: ResolvedFileSystemMutationLockOptions,
  path: string,
  contents: string
): Promise<void> {
  const handle = await options.fileSystem.open(path, 'wx', 0o600)
  try {
    await handle.writeFile(contents, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

function getReclaimDirectory(directory: string): string {
  return `${directory}${reclaimSuffix}`
}

async function hasReclaimBarrier(
  options: ResolvedFileSystemMutationLockOptions,
  directory: string
): Promise<boolean> {
  if ((await statIfExists(options, getReclaimDirectory(directory))) !== null) return true
  return (await listUniqueReclaimBarriers(options, directory)).length > 0
}

async function listUniqueReclaimBarriers(
  options: ResolvedFileSystemMutationLockOptions,
  directory: string
): Promise<string[]> {
  return listArtifactDirectories(options, directory, reclaimedSuffix)
}

async function listArtifactDirectories(
  options: ResolvedFileSystemMutationLockOptions,
  directory: string,
  suffix: string
): Promise<string[]> {
  const parent = dirname(directory)
  const prefix = `${basename(directory)}${suffix}`
  let entries
  try {
    entries = await options.fileSystem.readdir(parent, { withFileTypes: true })
  } catch (error) {
    if (isMissingPathError(error)) return []
    throw error
  }
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => join(parent, entry.name))
}

async function ownerExistsAnywhere(
  options: ResolvedFileSystemMutationLockOptions,
  directory: string,
  expected: FileSystemMutationLockSnapshot
): Promise<boolean> {
  const canonical = await readLockSnapshot(options, directory)
  if (canonical && isSameOwner(canonical, expected)) return true
  const fixed = await readLockSnapshot(options, getReclaimDirectory(directory))
  if (fixed && isSameOwner(fixed, expected)) return true
  for (const barrier of await listUniqueReclaimBarriers(options, directory)) {
    const claimed = await readLockSnapshot(options, barrier)
    if (claimed && isSameOwner(claimed, expected)) return true
  }
  return false
}

async function statIfExists(options: ResolvedFileSystemMutationLockOptions, path: string) {
  try {
    return await options.fileSystem.stat(path)
  } catch (error) {
    if (isMissingPathError(error)) return null
    throw error
  }
}

async function waitForRetry(
  deadline: number,
  directory: string,
  durationMs: number
): Promise<void> {
  if (Date.now() >= deadline) {
    throw new Error(`Timed out waiting for file-system mutation lock ${directory}.`)
  }
  await new Promise((resolve) => setTimeout(resolve, durationMs))
}

function ownershipLostError(): Error {
  return new Error('File-system mutation lock ownership was lost.')
}

function isRetryableRenameError(error: unknown): boolean {
  return ['EACCES', 'EBUSY', 'EEXIST', 'ENOENT', 'ENOTEMPTY', 'EPERM'].includes(
    getErrorCode(error) ?? ''
  )
}

function isExistingTargetError(error: unknown): boolean {
  return ['EACCES', 'EBUSY', 'EEXIST', 'ENOTEMPTY', 'EPERM'].includes(getErrorCode(error) ?? '')
}

function isTransientLockFileSystemError(error: unknown): boolean {
  return ['EACCES', 'EBUSY', 'EMFILE', 'ENFILE', 'EPERM'].includes(getErrorCode(error) ?? '')
}

function getErrorCode(error: unknown): string | null {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : null
}

function isMissingPathError(error: unknown): boolean {
  return ['ENOENT', 'ENOTDIR'].includes(getErrorCode(error) ?? '')
}
