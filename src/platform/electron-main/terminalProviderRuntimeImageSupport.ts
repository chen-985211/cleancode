import { createHash, randomUUID } from 'node:crypto'
import { constants, type Stats } from 'node:fs'
import { access, cp, mkdir, readFile, readdir, rename, rm, stat, utimes } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'

import {
  isTerminalProviderLivenessReference,
  observeTerminalProviderLiveness,
  type TerminalProviderLivenessReference
} from '../../contexts/run/infrastructure/provider/TerminalProviderHeartbeat'
import { acquireRuntimeImagePublishLock } from './TerminalProviderRuntimeImagePublishLock'
import type {
  RuntimeDataFingerprint,
  RuntimeFileStatFingerprint
} from './terminalProviderRuntimeImageManifest'
import { isSafeRelativePath } from './terminalProviderRuntimeImageManifest'

export type RuntimeImagePinResolution =
  { readonly status: 'known'; readonly imageKey: string | null } | { readonly status: 'unknown' }

const retiredRuntimeImagesDirectoryName = '.retired-images+state'
const abandonedStagingRetentionMs = 24 * 60 * 60 * 1_000
export const terminalProviderRetiredRuntimeImageRetentionMs = 24 * 60 * 60 * 1_000

export interface RuntimeImageRetirementFileSystem {
  readonly rm: typeof rm
  readonly stat: typeof stat
  readonly utimes: typeof utimes
}

const runtimeImageRetirementFileSystem: RuntimeImageRetirementFileSystem = { rm, stat, utimes }

function isRuntimeImageRetirementDirectory(name: string): boolean {
  return name === retiredRuntimeImagesDirectoryName
}

async function isRuntimeImageRetirementExpired(
  runtimeRootDirectory: string,
  imageKey: string
): Promise<boolean> {
  const retirementRoot = join(runtimeRootDirectory, retiredRuntimeImagesDirectoryName)
  const retirementMarker = join(retirementRoot, imageKey)
  try {
    await mkdir(retirementRoot, { recursive: true })
    await mkdir(retirementMarker)
    return false
  } catch (error) {
    if (getErrorCode(error) !== 'EEXIST') return false
    return isOlderThan(retirementMarker, terminalProviderRetiredRuntimeImageRetentionMs)
  }
}

export async function clearRuntimeImageRetirement(
  runtimeRootDirectory: string,
  imageKey: string,
  fileSystem: RuntimeImageRetirementFileSystem = runtimeImageRetirementFileSystem
): Promise<boolean> {
  const retirementMarker = join(runtimeRootDirectory, retiredRuntimeImagesDirectoryName, imageKey)
  const refreshedAt = new Date()
  let refreshed = false
  try {
    await fileSystem.utimes(retirementMarker, refreshedAt, refreshedAt)
    refreshed = true
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') return true
  }
  try {
    await fileSystem.rm(retirementMarker, {
      force: true,
      recursive: true
    })
    return true
  } catch {
    if (refreshed) return true
  }
  try {
    await fileSystem.stat(retirementMarker)
    return false
  } catch (error) {
    return getErrorCode(error) === 'ENOENT'
  }
}

export async function reserveRuntimeImage(
  options: {
    readonly retirementFileSystem?: RuntimeImageRetirementFileSystem
    readonly runtimeRootDirectory: string
  },
  imageKey: string
): Promise<void> {
  if (
    await clearRuntimeImageRetirement(
      options.runtimeRootDirectory,
      imageKey,
      options.retirementFileSystem
    )
  ) {
    return
  }
  throw new Error(`Terminal Provider runtime image reservation failed for ${imageKey}.`)
}

async function pruneRetiredRuntimeImage(options: {
  readonly currentImageKey: string
  readonly imageKey: string
  readonly processIsAlive: (processId: number) => boolean
  readonly readPinnedImage: () => Promise<RuntimeImagePinResolution>
  readonly runtimeRootDirectory: string
}): Promise<void> {
  if (!(await isRuntimeImageRetirementExpired(options.runtimeRootDirectory, options.imageKey))) {
    return
  }
  const publishLock = await acquireRuntimeImagePublishLock(
    options.runtimeRootDirectory,
    options.imageKey,
    options.processIsAlive
  ).catch(() => null)
  if (!publishLock) return
  try {
    await publishLock.assertOwned()
    const pinnedImage = await options.readPinnedImage()
    if (
      pinnedImage.status === 'unknown' ||
      options.imageKey === options.currentImageKey ||
      options.imageKey === pinnedImage.imageKey
    ) {
      if (pinnedImage.status === 'known') {
        await clearRuntimeImageRetirement(options.runtimeRootDirectory, options.imageKey)
      }
      return
    }
    if (!(await isRuntimeImageRetirementExpired(options.runtimeRootDirectory, options.imageKey))) {
      return
    }
    await publishLock.assertOwned()
    await rm(join(options.runtimeRootDirectory, options.imageKey), {
      force: true,
      recursive: true
    })
    await publishLock.assertOwned()
    await clearRuntimeImageRetirement(options.runtimeRootDirectory, options.imageKey)
  } catch {
    // Runtime image cleanup is best-effort and must not prevent Provider startup.
  } finally {
    await publishLock.close().catch(() => undefined)
  }
}

export async function pruneUnusedRuntimeImages(options: {
  readonly currentImageKey: string
  readonly processIsAlive: (processId: number) => boolean
  readonly readPinnedImage: () => Promise<RuntimeImagePinResolution>
  readonly runtimeRootDirectory: string
}): Promise<void> {
  const pinnedImage = await options.readPinnedImage()
  if (pinnedImage.status === 'unknown') return
  const entries = await readdir(options.runtimeRootDirectory, { withFileTypes: true }).catch(
    () => []
  )
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory() || isRuntimeImageRetirementDirectory(entry.name)) return
      if (entry.name === options.currentImageKey || entry.name === pinnedImage.imageKey) {
        await clearRuntimeImageRetirement(options.runtimeRootDirectory, entry.name)
        return
      }
      if (entry.name.includes('.publish-lock')) return
      const path = join(options.runtimeRootDirectory, entry.name)
      if (entry.name.includes('.staging-')) {
        if (await isOlderThan(path, abandonedStagingRetentionMs)) {
          await rm(path, { force: true, recursive: true }).catch(() => undefined)
        }
        return
      }
      await pruneRetiredRuntimeImage({
        ...options,
        imageKey: entry.name
      })
    })
  )
}

export async function resolveRuntimeImagePin(
  providerStateDirectory: string,
  processIsAlive: (processId: number) => boolean
): Promise<RuntimeImagePinResolution> {
  const metadataPath = join(providerStateDirectory, 'provider.json')
  let serializedMetadata: string
  try {
    serializedMetadata = await readFile(metadataPath, 'utf8')
  } catch (error) {
    return getErrorCode(error) === 'ENOENT' || getErrorCode(error) === 'ENOTDIR'
      ? { status: 'known', imageKey: null }
      : { status: 'unknown' }
  }
  let value: unknown
  try {
    value = JSON.parse(serializedMetadata)
  } catch {
    return { status: 'unknown' }
  }
  if (!isProviderPinMetadata(value)) return { status: 'unknown' }
  if (!('runtimeImageKey' in value)) {
    return resolvePinIfMetadataUnchanged(metadataPath, serializedMetadata, null)
  }
  if (
    typeof value.runtimeImageKey !== 'string' ||
    sanitizePathSegment(value.runtimeImageKey) !== value.runtimeImageKey
  ) {
    return { status: 'unknown' }
  }
  if (value.liveness) {
    const liveness = await observeTerminalProviderLiveness(
      providerStateDirectory,
      {
        instanceId: value.instanceId,
        processId: value.processId,
        startedAt: value.startedAt,
        liveness: value.liveness
      },
      processIsAlive
    )
    if (liveness.state === 'unknown') return { status: 'unknown' }
    return resolvePinIfMetadataUnchanged(
      metadataPath,
      serializedMetadata,
      liveness.state === 'alive' || liveness.state === 'starting' ? value.runtimeImageKey : null
    )
  }
  if (value.processId === 0) {
    return resolvePinIfMetadataUnchanged(metadataPath, serializedMetadata, value.runtimeImageKey)
  }
  try {
    return resolvePinIfMetadataUnchanged(
      metadataPath,
      serializedMetadata,
      processIsAlive(value.processId) ? value.runtimeImageKey : null
    )
  } catch {
    return { status: 'unknown' }
  }
}

async function resolvePinIfMetadataUnchanged(
  metadataPath: string,
  expectedContents: string,
  imageKey: string | null
): Promise<RuntimeImagePinResolution> {
  try {
    return (await readFile(metadataPath, 'utf8')) === expectedContents
      ? { status: 'known', imageKey }
      : { status: 'unknown' }
  } catch {
    return { status: 'unknown' }
  }
}

interface ProviderPinMetadata {
  readonly instanceId: string
  readonly liveness?: TerminalProviderLivenessReference
  readonly processId: number
  readonly runtimeImageKey?: unknown
  readonly startedAt: string
}

function isProviderPinMetadata(value: unknown): value is ProviderPinMetadata {
  return (
    typeof value === 'object' &&
    value !== null &&
    'processId' in value &&
    typeof value.processId === 'number' &&
    Number.isSafeInteger(value.processId) &&
    value.processId >= 0 &&
    (!('liveness' in value) ||
      (isTerminalProviderLivenessReference(value.liveness) &&
        'instanceId' in value &&
        typeof value.instanceId === 'string' &&
        value.instanceId.length > 0 &&
        'startedAt' in value &&
        typeof value.startedAt === 'string' &&
        Number.isFinite(Date.parse(value.startedAt))))
  )
}

export async function copyPath(
  source: string,
  destination: string,
  filter?: (sourcePath: string) => boolean
): Promise<void> {
  await mkdir(dirname(destination), { recursive: true })
  await cp(source, destination, {
    recursive: true,
    dereference: true,
    force: true,
    ...(filter ? { filter } : {})
  })
}

export async function quarantineIncompleteImage(
  root: string,
  imageKey: string
): Promise<string | null> {
  const imageDirectory = join(root, imageKey)
  if (!(await pathExists(imageDirectory))) return null
  const quarantineDirectory = join(root, `${imageKey}.invalid-${randomUUID()}`)
  try {
    await rename(imageDirectory, quarantineDirectory)
    return quarantineDirectory
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') return null
    throw error
  }
}

export async function readRuntimeDataFingerprint(
  directory: string,
  name: string,
  readContents: (path: string) => Promise<Buffer> = readFile
): Promise<RuntimeDataFingerprint> {
  const contents = await readContents(join(directory, name))
  return { name, sha256: createHash('sha256').update(contents).digest('hex') }
}

export async function readFileStatFingerprint(
  path: string,
  relativePath: string,
  statFile: (path: string) => Promise<Stats>
): Promise<RuntimeFileStatFingerprint> {
  const value = await statFile(path)
  if (!value.isFile())
    throw new Error(`Terminal Provider runtime closure entry is not a file: ${path}`)
  return {
    relativePath,
    size: value.size,
    mtimeMs: value.mtimeMs,
    ctimeMs: value.ctimeMs
  }
}

export function updateDigestFile(
  digest: ReturnType<typeof createHash>,
  relativePath: string,
  contents: Buffer
): void {
  digest
    .update(relativePath)
    .update('\0')
    .update(String(contents.byteLength))
    .update('\0')
    .update(contents)
    .update('\0')
}

export function sha256(contents: Buffer): string {
  return createHash('sha256').update(contents).digest('hex')
}

export function toContainedRelativePath(root: string, path: string): string {
  const result = relative(root, path)
  if (!isSafeRelativePath(result)) {
    throw new Error(`Terminal Provider runtime path escapes the application directory: ${path}`)
  }
  return result.split(/[\\/]+/).join('/')
}

export function isPathInside(root: string, path: string): boolean {
  return isSafeRelativePath(relative(root, path))
}

export function sanitizePathSegment(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80)
  return sanitized.length > 0 ? sanitized : 'unknown'
}

export function isSafeImageKey(value: string): boolean {
  return value.length > 0 && value.length <= 160 && /^[A-Za-z0-9._-]+$/.test(value)
}

export async function listRuntimeNodePtyFiles(
  root: string,
  architecture: string
): Promise<string[]> {
  const files: string[] = []
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    await Promise.all(
      entries.map(async (entry) => {
        const sourcePath = join(directory, entry.name)
        if (!isRuntimeNodePtyPath(sourcePath, architecture)) return
        if (entry.isDirectory()) {
          await visit(sourcePath)
        } else if (entry.isFile()) {
          files.push(sourcePath)
        }
      })
    )
  }
  await visit(root)
  return files.sort()
}

export function isRuntimeNodePtyPath(sourcePath: string, architecture: string): boolean {
  const normalized = sourcePath.replaceAll('\\', '/').toLowerCase()
  if (normalized.endsWith('.pdb')) return false
  const prebuild = normalized.match(/\/prebuilds\/(win32-[^/]+)/)
  return !prebuild || prebuild[1] === `win32-${architecture}`.toLowerCase()
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function isProcessAlive(processId: number): boolean {
  if (!Number.isSafeInteger(processId) || processId <= 0) return false
  try {
    process.kill(processId, 0)
    return true
  } catch (error) {
    return getErrorCode(error) !== 'ESRCH'
  }
}

export function getErrorCode(error: unknown): string | null {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
    ? error.code
    : null
}

async function isOlderThan(path: string, durationMs: number): Promise<boolean> {
  try {
    return Date.now() - (await stat(path)).mtimeMs >= durationMs
  } catch {
    return false
  }
}
