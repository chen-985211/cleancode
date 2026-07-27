import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import {
  access,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  truncate
} from 'node:fs/promises'
import { dirname, join } from 'node:path'

import type { TerminalModelCheckpoint } from '../../application/dto/TerminalModelSnapshot'
import type { SequencedTerminalOutput } from '../../application/ports/TerminalModelPort'
import type { TerminalSessionSnapshot } from '../../domain/aggregates/TerminalSession'
import type { TerminalRunScope } from '../../domain/value-objects/TerminalRunScope'
import { resolveTerminalOwnerRef } from '../../domain/value-objects/TerminalRunScope'
import { isSameTerminalRun } from '../../domain/value-objects/TerminalRunScope'
import { createExpectedAppError } from '../../../../shared-kernel/application/errors/AppError'

export interface TerminalRecoveryRecord {
  readonly schemaVersion: 2
  readonly providerInstanceId: string
  readonly updatedAt: string
  readonly session: TerminalSessionSnapshot
  readonly model: TerminalModelCheckpoint
}

interface TerminalRecoveryBundle {
  readonly checkpoint: TerminalRecoveryRecord
  readonly output: readonly SequencedTerminalOutput[]
}

export interface TerminalRecoveryLoadIssue {
  readonly storageKey: string
  readonly reason: 'corrupted' | 'unsupported-version'
}

export interface TerminalRecoveryLoadResult {
  readonly sessions: readonly TerminalRecoveryBundle[]
  readonly issues: readonly TerminalRecoveryLoadIssue[]
}

export interface TerminalRecoveryStoreLimits {
  readonly maxCheckpointBytes: number
  readonly maxOutputLogBytes: number
  readonly maxColdSessions: number
  readonly maxTotalBytes: number
  readonly coldRetentionMs: number
}

const defaultTerminalRecoveryStoreLimits: TerminalRecoveryStoreLimits = {
  maxCheckpointBytes: 12 * 1024 * 1024,
  maxOutputLogBytes: 4 * 1024 * 1024,
  maxColdSessions: 64,
  maxTotalBytes: 512 * 1024 * 1024,
  coldRetentionMs: 7 * 24 * 60 * 60 * 1000
}

export class FileTerminalRecoveryStore {
  private readonly limits: TerminalRecoveryStoreLimits
  private readonly now: () => number
  private operationTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly options: {
      readonly rootDirectory: string
      readonly limits?: Partial<TerminalRecoveryStoreLimits>
      readonly now?: () => number
    }
  ) {
    this.limits = { ...defaultTerminalRecoveryStoreLimits, ...options.limits }
    this.now = options.now ?? Date.now
  }

  async writeCheckpoint(
    record: TerminalRecoveryRecord,
    options: { readonly truncateOutputLog?: boolean } = {}
  ): Promise<void> {
    const contents = `${JSON.stringify(record)}\n`
    const byteLength = Buffer.byteLength(contents)
    if (byteLength > this.limits.maxCheckpointBytes) {
      throw storageLimitError('checkpoint', byteLength, this.limits.maxCheckpointBytes)
    }

    await this.runExclusive(async () => {
      await this.ensureRootDirectory()
      const sessionDirectory = this.sessionDirectory(record.session)
      await this.ensureGlobalCapacity(
        record.session,
        byteLength,
        options.truncateOutputLog ?? false
      )
      await mkdir(sessionDirectory, { mode: 0o700, recursive: true })
      await atomicWrite(join(sessionDirectory, 'checkpoint.json'), contents)
      if (options.truncateOutputLog) {
        await truncateFileIfPresent(join(sessionDirectory, 'output.log'))
      }
    })
  }

  async appendOutput(
    identity: TerminalRunScope,
    output: SequencedTerminalOutput
  ): Promise<'appended' | 'checkpoint-required'> {
    return this.appendOutputs(identity, [output])
  }

  async appendOutputs(
    identity: TerminalRunScope,
    outputs: readonly SequencedTerminalOutput[]
  ): Promise<'appended' | 'checkpoint-required'> {
    if (outputs.length === 0) return 'appended'
    return this.runExclusive(() => this.appendOutputsNow(identity, outputs))
  }

  async load(): Promise<TerminalRecoveryLoadResult> {
    return this.runExclusive(() => this.loadNow())
  }

  async delete(identity: TerminalRunScope): Promise<void> {
    await this.runExclusive(() => this.deleteNow(identity))
  }

  async pruneColdHistory(): Promise<readonly TerminalRecoveryLoadIssue[]> {
    return this.runExclusive(() => this.pruneColdHistoryNow())
  }

  private async appendOutputsNow(
    identity: TerminalRunScope,
    outputs: readonly SequencedTerminalOutput[]
  ): Promise<'appended' | 'checkpoint-required'> {
    const sessionDirectory = this.sessionDirectory(identity)
    const checkpointPath = join(sessionDirectory, 'checkpoint.json')
    if (!(await pathExists(checkpointPath))) {
      throw createExpectedAppError(
        'TERMINAL_RECOVERY_DATA_CORRUPTED',
        'Terminal recovery output has no checkpoint.'
      )
    }

    const contents = outputs
      .map((output) => `${JSON.stringify({ schemaVersion: 1, ...output })}\n`)
      .join('')
    const byteLength = Buffer.byteLength(contents)
    const outputPath = join(sessionDirectory, 'output.log')
    const currentBytes = await fileSize(outputPath)
    const totalBytes = await directorySize(this.sessionsDirectory())
    if (
      currentBytes + byteLength > this.limits.maxOutputLogBytes ||
      totalBytes + byteLength > this.limits.maxTotalBytes
    ) {
      return 'checkpoint-required'
    }

    const handle = await open(outputPath, 'a', 0o600)
    try {
      await handle.writeFile(contents, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }
    return 'appended'
  }

  private async loadNow(): Promise<TerminalRecoveryLoadResult> {
    await this.ensureRootDirectory()
    const entries = await readdir(this.sessionsDirectory(), { withFileTypes: true })
    const sessions: TerminalRecoveryBundle[] = []
    const issues: TerminalRecoveryLoadIssue[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const storageKey = entry.name
      const directory = join(this.sessionsDirectory(), storageKey)
      const checkpointResult = await readCheckpoint(join(directory, 'checkpoint.json'))
      if ('reason' in checkpointResult) {
        issues.push({ storageKey, reason: checkpointResult.reason })
        continue
      }
      const outputResult = await readOutputLog(
        join(directory, 'output.log'),
        checkpointResult.record.model.sequence
      )
      if ('reason' in outputResult) {
        issues.push({ storageKey, reason: outputResult.reason })
        continue
      }
      sessions.push({ checkpoint: checkpointResult.record, output: outputResult.output })
    }

    return { sessions, issues }
  }

  private async deleteNow(identity: TerminalRunScope): Promise<void> {
    await rm(this.sessionDirectory(identity), { force: true, recursive: true })
  }

  private async pruneColdHistoryNow(): Promise<readonly TerminalRecoveryLoadIssue[]> {
    const loaded = await this.loadNow()
    for (const issue of loaded.issues) {
      await rm(join(this.sessionsDirectory(), issue.storageKey), { force: true, recursive: true })
    }
    const cold = loaded.sessions
      .filter(({ checkpoint }) => checkpoint.session.status !== 'running')
      .sort(
        (left, right) =>
          Date.parse(left.checkpoint.updatedAt) - Date.parse(right.checkpoint.updatedAt)
      )
    const expiresBefore = this.now() - this.limits.coldRetentionMs
    const expired = cold.filter(
      ({ checkpoint }) => Date.parse(checkpoint.updatedAt) < expiresBefore
    )
    const overflowCount = Math.max(0, cold.length - this.limits.maxColdSessions)
    const overflow = cold.slice(0, overflowCount)
    const removals = new Map(
      [...expired, ...overflow].map((bundle) => [bundle.checkpoint.session.sessionId, bundle])
    )
    for (const { checkpoint } of removals.values()) {
      await this.deleteNow(checkpoint.session)
    }
    return loaded.issues
  }

  private async ensureRootDirectory(): Promise<void> {
    await mkdir(this.sessionsDirectory(), { mode: 0o700, recursive: true })
  }

  private async ensureGlobalCapacity(
    identity: TerminalRunScope,
    replacementBytes: number,
    truncateOutputLog: boolean
  ) {
    await this.pruneColdHistoryNow()
    const currentCheckpointBytes = await fileSize(
      join(this.sessionDirectory(identity), 'checkpoint.json')
    )
    const truncatedOutputBytes = truncateOutputLog
      ? await fileSize(join(this.sessionDirectory(identity), 'output.log'))
      : 0
    let projectedBytes =
      (await directorySize(this.sessionsDirectory())) -
      currentCheckpointBytes -
      truncatedOutputBytes +
      replacementBytes
    if (projectedBytes <= this.limits.maxTotalBytes) return

    const loaded = await this.loadNow()
    const cold = loaded.sessions
      .filter(
        ({ checkpoint }) =>
          checkpoint.session.status !== 'running' &&
          !isSameTerminalRun(checkpoint.session, identity)
      )
      .sort(
        (left, right) =>
          Date.parse(left.checkpoint.updatedAt) - Date.parse(right.checkpoint.updatedAt)
      )
    for (const { checkpoint } of cold) {
      const bytes = await directorySize(this.sessionDirectory(checkpoint.session))
      await this.deleteNow(checkpoint.session)
      projectedBytes -= bytes
      if (projectedBytes <= this.limits.maxTotalBytes) return
    }

    throw storageLimitError('store', projectedBytes, this.limits.maxTotalBytes)
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation, operation)
    this.operationTail = result.then(
      () => undefined,
      () => undefined
    )
    return result
  }

  private sessionsDirectory(): string {
    return join(this.options.rootDirectory, 'sessions')
  }

  private sessionDirectory(identity: TerminalRunScope): string {
    return join(this.sessionsDirectory(), createStorageKey(identity))
  }
}

interface PersistedOutputRecord extends SequencedTerminalOutput {
  readonly schemaVersion: 1
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  const handle = await open(temporaryPath, 'wx', 0o600)
  try {
    await handle.writeFile(contents, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await rename(temporaryPath, path)
    await syncDirectory(dirname(path))
  } catch (error) {
    await rm(temporaryPath, { force: true })
    throw error
  }
}

async function syncDirectory(path: string): Promise<void> {
  const directoryHandle = await open(path, 'r').catch((error: unknown) => {
    if (isUnsupportedDirectorySyncError(error)) return null
    throw error
  })

  try {
    await directoryHandle?.sync()
  } catch (error) {
    if (!isUnsupportedDirectorySyncError(error)) throw error
  } finally {
    await directoryHandle?.close().catch(() => undefined)
  }
}

function isUnsupportedDirectorySyncError(error: unknown): boolean {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : null

  return code !== null && ['EISDIR', 'EINVAL', 'ENOTSUP', 'EPERM'].includes(code)
}

async function readCheckpoint(
  path: string
): Promise<
  | { readonly record: TerminalRecoveryRecord }
  | { readonly reason: TerminalRecoveryLoadIssue['reason'] }
> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    if (isTerminalRecoveryRecord(value)) return { record: value }
    if (isLegacyTerminalRecoveryRecord(value)) return { record: migrateLegacyRecord(value) }
    if (isRecord(value) && value.schemaVersion !== 1 && value.schemaVersion !== 2) {
      return { reason: 'unsupported-version' }
    }
    return { reason: 'corrupted' }
  } catch {
    return { reason: 'corrupted' }
  }
}

async function readOutputLog(
  path: string,
  checkpointSequence: number
): Promise<
  | { readonly output: readonly SequencedTerminalOutput[] }
  | { readonly reason: TerminalRecoveryLoadIssue['reason'] }
> {
  if (!(await pathExists(path))) return { output: [] }
  try {
    const contents = await readFile(path, 'utf8')
    const output = contents
      .split('\n')
      .filter(Boolean)
      .map((line): unknown => JSON.parse(line))
    if (output.some((value) => isRecord(value) && value.schemaVersion !== 1)) {
      return { reason: 'unsupported-version' }
    }
    if (!output.every(isPersistedOutputRecord)) return { reason: 'corrupted' }
    const replay = output.filter(({ sequence }) => sequence > checkpointSequence)
    let expectedSequence = checkpointSequence + 1
    for (const entry of replay) {
      if (entry.sequence !== expectedSequence) return { reason: 'corrupted' }
      expectedSequence += 1
    }
    return { output: replay.map(({ data, sequence }) => ({ data, sequence })) }
  } catch {
    return { reason: 'corrupted' }
  }
}

function isTerminalRecoveryRecord(value: unknown): value is TerminalRecoveryRecord {
  if (!isRecord(value) || value.schemaVersion !== 2) return false
  return isTerminalRecoveryRecordContents(value, true)
}

interface LegacyTerminalRecoveryRecord extends Omit<
  TerminalRecoveryRecord,
  'schemaVersion' | 'session'
> {
  readonly schemaVersion: 1
  readonly session: Omit<TerminalSessionSnapshot, 'terminalSourceTheme'>
}

function isLegacyTerminalRecoveryRecord(value: unknown): value is LegacyTerminalRecoveryRecord {
  if (!isRecord(value) || value.schemaVersion !== 1) return false
  return isTerminalRecoveryRecordContents(value, false)
}

function isTerminalRecoveryRecordContents(
  value: Record<string, unknown>,
  requiresTerminalSourceTheme: boolean
): boolean {
  if (
    typeof value.providerInstanceId !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !isRecord(value.session) ||
    !isRecord(value.model)
  ) {
    return false
  }
  return (
    isTerminalRunScope(value.session) &&
    isTerminalRunScope(value.model.identity) &&
    isSameTerminalRun(value.session as unknown as TerminalRunScope, value.model.identity) &&
    isTerminalSessionRecord(value.session, requiresTerminalSourceTheme) &&
    value.model.schemaVersion === 1 &&
    Number.isInteger(value.model.sequence) &&
    (value.model.sequence as number) >= 0 &&
    typeof value.model.content === 'string' &&
    typeof value.model.normalContent === 'string' &&
    typeof value.model.transcript === 'string' &&
    typeof value.model.title === 'string' &&
    typeof value.model.workingDirectory === 'string' &&
    value.model.unicodeVersion === '11' &&
    [1000, 5000, 10000].includes(value.model.scrollbackRows as number) &&
    isTerminalDimensions(value.model.dimensions) &&
    isTerminalModes(value.model.modes) &&
    Number.isFinite(Date.parse(value.updatedAt))
  )
}

function migrateLegacyRecord(record: LegacyTerminalRecoveryRecord): TerminalRecoveryRecord {
  return {
    ...record,
    schemaVersion: 2,
    session: {
      ...record.session,
      terminalSourceTheme: 'dark'
    }
  }
}

function isTerminalSessionRecord(
  value: Record<string, unknown>,
  requiresTerminalSourceTheme: boolean
): boolean {
  return (
    value.id === value.sessionId &&
    value.terminalBlockId === value.blockId &&
    typeof value.workingDirectory === 'string' &&
    (value.processId === null ||
      (typeof value.processId === 'number' &&
        Number.isSafeInteger(value.processId) &&
        value.processId > 0)) &&
    ['idle', 'running', 'stopping', 'exited', 'failed'].includes(value.status as string) &&
    ['interactive', 'direct', 'workflow'].includes(value.kind as string) &&
    ['terminate-on-application-exit', 'keep-after-application-exit'].includes(
      value.retentionPolicy as string
    ) &&
    ['fresh', 'warm', 'historical', 'ended'].includes(value.recoveryKind as string) &&
    (requiresTerminalSourceTheme
      ? value.terminalSourceTheme === 'dark' || value.terminalSourceTheme === 'light'
      : value.terminalSourceTheme === undefined) &&
    Array.isArray(value.inputHistory) &&
    value.inputHistory.every((entry) => typeof entry === 'string') &&
    (value.exitCode === null || typeof value.exitCode === 'number') &&
    (value.failureReason === null || typeof value.failureReason === 'string')
  )
}

function isTerminalDimensions(value: unknown): boolean {
  return (
    isRecord(value) &&
    Number.isInteger(value.columns) &&
    (value.columns as number) > 0 &&
    (value.columns as number) <= 1000 &&
    Number.isInteger(value.rows) &&
    (value.rows as number) > 0 &&
    (value.rows as number) <= 1000
  )
}

function isTerminalModes(value: unknown): boolean {
  if (!isRecord(value)) return false
  const booleanModes = [
    'applicationCursorKeysMode',
    'applicationKeypadMode',
    'bracketedPasteMode',
    'insertMode',
    'originMode',
    'reverseWraparoundMode',
    'sendFocusMode',
    'synchronizedOutputMode',
    'wraparoundMode'
  ]
  return (
    booleanModes.every((mode) => typeof value[mode] === 'boolean') &&
    ['none', 'x10', 'vt200', 'drag', 'any'].includes(value.mouseTrackingMode as string)
  )
}

function isTerminalRunScope(value: unknown): value is TerminalRunScope {
  if (!isRecord(value)) return false
  return (
    typeof value.projectId === 'string' &&
    typeof value.projectDirectory === 'string' &&
    typeof value.workspaceId === 'string' &&
    typeof value.workspaceDirectory === 'string' &&
    (typeof value.gitBranch === 'string' || value.gitBranch === null) &&
    typeof value.blockId === 'string' &&
    isTerminalOwnerRef(value.owner) &&
    typeof value.sessionId === 'string' &&
    typeof value.runId === 'string' &&
    Number.isInteger(value.generation) &&
    (value.generation as number) > 0
  )
}

function isTerminalOwnerRef(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      (value.kind === 'block' || value.kind === 'agent') &&
      typeof value.id === 'string' &&
      value.id.length > 0)
  )
}

function isPersistedOutputRecord(value: unknown): value is PersistedOutputRecord {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    Number.isInteger(value.sequence) &&
    typeof value.data === 'string'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function createStorageKey(identity: TerminalRunScope): string {
  const owner = resolveTerminalOwnerRef(identity)
  return createHash('sha256')
    .update(
      JSON.stringify([
        identity.projectId,
        identity.workspaceId,
        owner.kind,
        owner.id,
        identity.sessionId,
        identity.runId,
        identity.generation
      ])
    )
    .digest('hex')
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size
  } catch {
    return 0
  }
}

async function directorySize(directory: string): Promise<number> {
  let total = 0
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const path = join(directory, entry.name)
    total += entry.isDirectory() ? await directorySize(path) : await fileSize(path)
  }
  return total
}

async function truncateFileIfPresent(path: string): Promise<void> {
  if (await pathExists(path)) await truncate(path, 0)
}

function storageLimitError(kind: string, actualBytes: number, limitBytes: number) {
  return createExpectedAppError(
    'TERMINAL_RECOVERY_STORAGE_LIMIT',
    'Terminal recovery storage limit was exceeded.',
    { actualBytes, kind, limitBytes }
  )
}
