import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { dirname } from 'node:path'

import { acquireFileSystemMutationLock } from './FileSystemMutationLock'
import {
  cleanupRevokedTerminalProviderHeartbeat,
  isTerminalProviderLivenessReference,
  revokeDeadTerminalProviderHeartbeat,
  revokeTerminalProviderHeartbeat,
  type TerminalProviderLivenessReference
} from './TerminalProviderHeartbeat'
import { terminalProviderProtocolVersion } from './TerminalProviderProtocol'

export interface TerminalProviderMetadata {
  readonly schemaVersion: 1
  readonly protocolVersion: number
  readonly instanceId: string
  readonly authToken: string
  readonly endpoint: string
  readonly processId: number
  readonly startedAt: string
  readonly liveness?: TerminalProviderLivenessReference
  readonly runtimeImageKey?: string
}

interface ProviderMetadataWriteEnvironment {
  readonly assertWriteAllowed?: () => Promise<void>
  readonly onWriteRejected?: (error: unknown) => Promise<void>
  readonly platform?: NodeJS.Platform
  readonly rename?: (sourcePath: string, targetPath: string) => Promise<void>
  readonly wait?: (durationMs: number) => Promise<void>
}

interface ResolvedProviderMetadataWriteEnvironment {
  readonly assertWriteAllowed?: () => Promise<void>
  readonly onWriteRejected?: (error: unknown) => Promise<void>
  readonly platform: NodeJS.Platform
  readonly rename: (sourcePath: string, targetPath: string) => Promise<void>
  readonly wait: (durationMs: number) => Promise<void>
}

interface RemoveStaleProviderMetadataOptions {
  readonly requireDeadLiveness?: boolean
}

const providerMetadataMutationGuardSuffix = '.mutation-guard'
const windowsProviderMetadataRenameRetryDelaysMs = [10, 20, 40, 80, 160] as const

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
  metadata: TerminalProviderMetadata,
  environment: ProviderMetadataWriteEnvironment = {}
): Promise<void> {
  await mkdir(dirname(path), { mode: 0o700, recursive: true })
  const mutationLock = await acquireFileSystemMutationLock({
    directory: `${path}${providerMetadataMutationGuardSuffix}`,
    isProcessAlive: isProviderMetadataProcessAlive
  })
  try {
    await mutationLock.assertOwned()
    await writeProviderMetadata(path, metadata, environment, () => mutationLock.assertOwned())
    await mutationLock.assertOwned()
  } finally {
    await mutationLock.close()
  }
}

async function writeProviderMetadata(
  path: string,
  metadata: TerminalProviderMetadata,
  environment: ProviderMetadataWriteEnvironment,
  assertMutationOwned: () => Promise<void>
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
    await replaceProviderMetadataFile(
      temporary,
      path,
      {
        assertWriteAllowed: environment.assertWriteAllowed,
        onWriteRejected: environment.onWriteRejected,
        platform: environment.platform ?? process.platform,
        rename: environment.rename ?? rename,
        wait: environment.wait ?? delayProviderMetadataOperation
      },
      assertMutationOwned
    )
    await syncDirectory(dirname(path))
  } catch (error) {
    await rm(temporary, { force: true })
    throw error
  }
}

async function replaceProviderMetadataFile(
  sourcePath: string,
  targetPath: string,
  environment: ResolvedProviderMetadataWriteEnvironment,
  assertMutationOwned: () => Promise<void>
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    await assertProviderMetadataWriteAllowed(assertMutationOwned, environment)
    try {
      await environment.rename(sourcePath, targetPath)
    } catch (error) {
      const retryDelayMs = windowsProviderMetadataRenameRetryDelaysMs[attempt]
      if (
        environment.platform !== 'win32' ||
        retryDelayMs === undefined ||
        !isTransientWindowsRenameError(error)
      ) {
        throw error
      }
      await environment.wait(retryDelayMs)
      continue
    }
    await assertProviderMetadataWriteAllowed(assertMutationOwned, environment)
    return
  }
}

async function assertProviderMetadataWriteAllowed(
  assertMutationOwned: () => Promise<void>,
  environment: ResolvedProviderMetadataWriteEnvironment
): Promise<void> {
  await assertMutationOwned()
  try {
    await environment.assertWriteAllowed?.()
  } catch (error) {
    try {
      await environment.onWriteRejected?.(error)
    } catch (rejectionError) {
      throw new AggregateError(
        [error, rejectionError],
        'Terminal Provider metadata write was rejected and cleanup was incomplete.'
      )
    }
    throw error
  }
  await assertMutationOwned()
}

export async function removeStaleProviderMetadata(
  metadata: TerminalProviderMetadata,
  metadataPath: string,
  options: RemoveStaleProviderMetadataOptions = {}
): Promise<boolean> {
  const mutationLock = await acquireFileSystemMutationLock({
    directory: `${metadataPath}${providerMetadataMutationGuardSuffix}`,
    isProcessAlive: isProviderMetadataProcessAlive
  })
  let removed = false
  let revokedHeartbeatPath: string | null = null
  const errors: unknown[] = []
  try {
    await mutationLock.assertOwned()
    const current = await readProviderMetadata(metadataPath)
    if (current && isSameProviderGeneration(current, metadata)) {
      await mutationLock.assertOwned()
      const confirmed = await readProviderMetadata(metadataPath)
      if (confirmed && isSameProviderGeneration(confirmed, metadata)) {
        const revocation = await revokeProviderHeartbeatForMetadataRemoval(
          confirmed,
          metadataPath,
          options
        )
        revokedHeartbeatPath = revocation.revokedPath
        await mutationLock.assertOwned()
        if (revocation.allowsRemoval) {
          const afterRevocation = await readProviderMetadata(metadataPath)
          if (afterRevocation && isSameProviderGeneration(afterRevocation, metadata)) {
            if (process.platform !== 'win32') {
              await rm(afterRevocation.endpoint, { force: true })
              await mutationLock.assertOwned()
            }
            const beforeRemoval = await readProviderMetadata(metadataPath)
            if (beforeRemoval && isSameProviderGeneration(beforeRemoval, metadata)) {
              await rm(metadataPath, { force: true })
              await mutationLock.assertOwned()
              removed = true
            }
          }
        }
      }
    }
  } catch (error) {
    errors.push(error)
  }
  await mutationLock.close().catch((error) => errors.push(error))
  await cleanupRevokedTerminalProviderHeartbeat(revokedHeartbeatPath).catch((error) =>
    errors.push(error)
  )
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) {
    throw new AggregateError(errors, 'Terminal Provider metadata cleanup was incomplete.')
  }
  return removed
}

async function revokeProviderHeartbeatForMetadataRemoval(
  metadata: TerminalProviderMetadata,
  metadataPath: string,
  options: RemoveStaleProviderMetadataOptions
): Promise<{ readonly allowsRemoval: boolean; readonly revokedPath: string | null }> {
  if (!options.requireDeadLiveness) {
    return {
      allowsRemoval: true,
      revokedPath: await revokeTerminalProviderHeartbeat(dirname(metadataPath), metadata)
    }
  }
  try {
    const revocation = await revokeDeadTerminalProviderHeartbeat(
      dirname(metadataPath),
      metadata,
      isProviderMetadataProcessAlive
    )
    return {
      allowsRemoval: revocation.observation.state === 'dead',
      revokedPath: revocation.revokedPath
    }
  } catch {
    return { allowsRemoval: false, revokedPath: null }
  }
}

function isProviderMetadata(value: unknown): value is TerminalProviderMetadata {
  return (
    typeof value === 'object' &&
    value !== null &&
    'schemaVersion' in value &&
    value.schemaVersion === 1 &&
    'protocolVersion' in value &&
    (value.protocolVersion === terminalProviderProtocolVersion ||
      value.protocolVersion === terminalProviderProtocolVersion - 1) &&
    'instanceId' in value &&
    typeof value.instanceId === 'string' &&
    'authToken' in value &&
    typeof value.authToken === 'string' &&
    'endpoint' in value &&
    typeof value.endpoint === 'string' &&
    'processId' in value &&
    typeof value.processId === 'number' &&
    'startedAt' in value &&
    typeof value.startedAt === 'string' &&
    Number.isFinite(Date.parse(value.startedAt)) &&
    (!('liveness' in value) || isTerminalProviderLivenessReference(value.liveness)) &&
    (!('runtimeImageKey' in value) || typeof value.runtimeImageKey === 'string')
  )
}

function isSameProviderGeneration(
  first: TerminalProviderMetadata,
  second: TerminalProviderMetadata
): boolean {
  return (
    first.instanceId === second.instanceId &&
    (first.liveness?.heartbeatId ?? null) === (second.liveness?.heartbeatId ?? null)
  )
}

function isProviderMetadataProcessAlive(processId: number): boolean {
  if (!Number.isSafeInteger(processId) || processId <= 0) return false
  try {
    process.kill(processId, 0)
    return true
  } catch (error) {
    return getNodeErrorCode(error) !== 'ESRCH'
  }
}

function delayProviderMetadataOperation(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

function getNodeErrorCode(error: unknown): string | null {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : null
}

function isTransientWindowsRenameError(error: unknown): boolean {
  const code = getNodeErrorCode(error)
  return code === 'EACCES' || code === 'EBUSY' || code === 'EPERM'
}

async function syncDirectory(path: string): Promise<void> {
  let directoryHandle: FileHandle | null = null

  try {
    directoryHandle = await open(path, 'r')
    await directoryHandle.sync()
  } catch (error) {
    if (!isUnsupportedDirectorySyncError(error)) throw error
  } finally {
    await directoryHandle?.close().catch(() => undefined)
  }
}

function isUnsupportedDirectorySyncError(error: unknown): boolean {
  const code = getNodeErrorCode(error)
  return code !== null && ['EISDIR', 'EINVAL', 'ENOTSUP', 'EPERM'].includes(code)
}
