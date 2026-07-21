import { createHash, randomUUID } from 'node:crypto'
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs'
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { connect } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { terminalProviderProtocolVersion } from './TerminalProviderProtocol'

export interface TerminalProviderMetadata {
  readonly schemaVersion: 1
  readonly protocolVersion: 1
  readonly instanceId: string
  readonly authToken: string
  readonly endpoint: string
  readonly processId: number
  readonly startedAt: string
}

export interface ProviderLaunchLockLease {
  close(): Promise<void>
}

interface ProviderLaunchLockRecord {
  readonly schemaVersion: 1
  readonly ownerId: string
  readonly processId: number
  readonly acquiredAt: string
}

interface ProviderLaunchLockSnapshot {
  readonly contentFingerprint: string | null
  readonly device: number
  readonly inode: number
  readonly modifiedAtMs: number
  readonly record: ProviderLaunchLockRecord | LegacyProviderLaunchLockRecord | null
  readonly size: number
}

interface LegacyProviderLaunchLockRecord {
  readonly processId: number
}

const providerLaunchLockInitializationGraceMs = 250
const providerLaunchLockStaleAfterMs = 15_000

export async function readProviderMetadata(path: string): Promise<TerminalProviderMetadata | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    return isProviderMetadata(value) ? value : null
  } catch {
    return null
  }
}

export async function atomicWriteProviderMetadata(
  path: string,
  metadata: TerminalProviderMetadata
): Promise<void> {
  await mkdir(dirname(path), { mode: 0o700, recursive: true })
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    const handle = await open(temporary, 'wx', 0o600)
    try {
      await handle.writeFile(`${JSON.stringify(metadata)}\n`, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    await rename(temporary, path)
    const directoryHandle = await open(dirname(path), 'r').catch(() => null)
    try {
      await directoryHandle?.sync()
    } finally {
      await directoryHandle?.close()
    }
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

export async function removeStaleProviderMetadata(
  metadata: TerminalProviderMetadata,
  metadataPath: string
): Promise<void> {
  await rm(metadataPath, { force: true })
  if (process.platform !== 'win32') await rm(metadata.endpoint, { force: true })
}

export function createProviderEndpoint(stateDirectory: string): string {
  const suffix = createHash('sha256').update(stateDirectory).digest('hex').slice(0, 24)
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\cleancode-terminal-${suffix}`
    : join(tmpdir(), `cleancode-terminal-${suffix}.sock`)
}

export function isProviderProcessAlive(processId: number): boolean {
  if (!Number.isSafeInteger(processId) || processId <= 0) return false
  try {
    process.kill(processId, 0)
    return true
  } catch {
    return false
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
    const descriptor = openSync(path, 'w', 0o600)
    closeSync(descriptor)
  } catch {
    // Provider startup can continue when diagnostics rotation is unavailable.
  }
}

export async function acquireProviderLaunchLock(
  path: string
): Promise<ProviderLaunchLockLease | null> {
  for (;;) {
    try {
      return await createLaunchLock(path)
    } catch (error) {
      if (getNodeErrorCode(error) !== 'EEXIST') throw error
    }

    const snapshot = await readLaunchLockSnapshot(path)
    if (!snapshot) continue
    const ageMs = getLaunchLockAgeMs(snapshot)
    if (!snapshot.record && ageMs < providerLaunchLockInitializationGraceMs) {
      await delayProviderOperation(providerLaunchLockInitializationGraceMs - ageMs)
      continue
    }
    if (
      ageMs < providerLaunchLockStaleAfterMs &&
      snapshot.record &&
      isProviderProcessAlive(snapshot.record.processId)
    ) {
      return null
    }
    if (!(await removeLaunchLockSnapshot(path, snapshot))) continue
  }
}

export function delayProviderOperation(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

export function getProviderErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isProviderMetadata(value: unknown): value is TerminalProviderMetadata {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 1 &&
    'protocolVersion' in value &&
    value.protocolVersion === terminalProviderProtocolVersion &&
    'instanceId' in value &&
    typeof value.instanceId === 'string' &&
    'authToken' in value &&
    typeof value.authToken === 'string' &&
    'endpoint' in value &&
    typeof value.endpoint === 'string' &&
    'processId' in value &&
    typeof value.processId === 'number' &&
    'startedAt' in value &&
    typeof value.startedAt === 'string'
  )
}

function getNodeErrorCode(error: unknown): string | null {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : null
}

async function createLaunchLock(path: string): Promise<ProviderLaunchLockLease> {
  const handle = await open(path, 'wx', 0o600)
  const record: ProviderLaunchLockRecord = {
    schemaVersion: 1,
    ownerId: randomUUID(),
    processId: process.pid,
    acquiredAt: new Date().toISOString()
  }
  try {
    await handle.writeFile(`${JSON.stringify(record)}\n`, 'utf8')
    await handle.sync()
    return new FileProviderLaunchLockLease(path, handle, record.ownerId)
  } catch (error) {
    await handle.close()
    await rm(path, { force: true })
    throw error
  }
}

async function readLaunchLockSnapshot(path: string): Promise<ProviderLaunchLockSnapshot | null> {
  const fileStat = await stat(path).catch(() => null)
  if (!fileStat) return null
  const content = await readFile(path, 'utf8').catch(() => null)
  let record: ProviderLaunchLockSnapshot['record'] = null
  if (content !== null) {
    try {
      record = readLaunchLockRecord(JSON.parse(content) as unknown)
    } catch {
      record = null
    }
  }
  return {
    contentFingerprint:
      content === null ? null : createHash('sha256').update(content).digest('hex'),
    device: fileStat.dev,
    inode: fileStat.ino,
    modifiedAtMs: fileStat.mtimeMs,
    record,
    size: fileStat.size
  }
}

function getLaunchLockAgeMs(snapshot: ProviderLaunchLockSnapshot): number {
  let acquiredAtMs = snapshot.modifiedAtMs
  if (snapshot.record && 'acquiredAt' in snapshot.record) {
    const recordedAtMs = Date.parse(snapshot.record.acquiredAt)
    if (Number.isFinite(recordedAtMs)) acquiredAtMs = Math.min(acquiredAtMs, recordedAtMs)
  }
  return Math.max(0, Date.now() - acquiredAtMs)
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
      acquiredAt: value.acquiredAt
    }
  }
  return { processId: value.processId }
}

async function removeLaunchLockSnapshot(
  path: string,
  snapshot: ProviderLaunchLockSnapshot
): Promise<boolean> {
  const current = await readLaunchLockSnapshot(path)
  if (!current || !isSameLaunchLockSnapshot(current, snapshot)) return false
  await rm(path, { force: true })
  return true
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

class FileProviderLaunchLockLease implements ProviderLaunchLockLease {
  private isClosed = false

  constructor(
    private readonly path: string,
    private readonly handle: FileHandle,
    private readonly ownerId: string
  ) {}

  async close(): Promise<void> {
    if (this.isClosed) return
    this.isClosed = true
    await this.handle.close()
    const current = await readLaunchLockSnapshot(this.path)
    if (current?.record && 'ownerId' in current.record && current.record.ownerId === this.ownerId) {
      await removeLaunchLockSnapshot(this.path, current)
    }
  }
}
