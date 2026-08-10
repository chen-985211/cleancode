import { open, readFile } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

export interface RuntimeDataFingerprint {
  readonly name: string
  readonly sha256: string
}

export interface RuntimeFileStatFingerprint {
  readonly relativePath: string
  readonly size: number
  readonly mtimeMs: number
  readonly ctimeMs: number
}

export interface RuntimeImageMarker {
  readonly schemaVersion: 2
  readonly imageKey: string
  readonly applicationVersion: string
  readonly electronVersion: string
  readonly architecture: string
  readonly completedAt: string
  readonly providerEntryRelativePath: string
  readonly runtimeDataFiles: readonly RuntimeDataFingerprint[]
  readonly sourceFiles: readonly RuntimeFileStatFingerprint[]
  readonly imageFiles: readonly RuntimeFileStatFingerprint[]
}

export const materializedMarkerName = '.materialized.json'

const requiredRuntimeDataFileNames = ['icudtl.dat', 'v8_context_snapshot.bin'] as const
const optionalRuntimeDataFileNames = ['snapshot_blob.bin'] as const
const allowedRuntimeDataFileNames = new Set<string>([
  ...requiredRuntimeDataFileNames,
  ...optionalRuntimeDataFileNames
])

export async function readRuntimeImageMarker(path: string): Promise<RuntimeImageMarker | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path, 'utf8'))
    return isRuntimeImageMarker(value) ? value : null
  } catch {
    return null
  }
}

export async function writeRuntimeImageMarker(
  path: string,
  marker: RuntimeImageMarker,
  replace = false
): Promise<void> {
  const handle = await open(path, replace ? 'w' : 'wx', 0o600)
  try {
    await handle.writeFile(`${JSON.stringify(marker)}\n`, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

export function areRuntimeDataFingerprintsEqual(
  first: readonly RuntimeDataFingerprint[],
  second: readonly RuntimeDataFingerprint[]
): boolean {
  return (
    first.length === second.length &&
    first.every(
      (value, index) => value.name === second[index]?.name && value.sha256 === second[index]?.sha256
    )
  )
}

export function areRuntimeFileStatsEqual(
  first: readonly RuntimeFileStatFingerprint[],
  second: readonly RuntimeFileStatFingerprint[]
): boolean {
  return (
    first.length === second.length &&
    first.every((value, index) => {
      const other = second[index]
      return (
        value.relativePath === other?.relativePath &&
        value.size === other.size &&
        value.mtimeMs === other.mtimeMs &&
        value.ctimeMs === other.ctimeMs
      )
    })
  )
}

export function isSafeRelativePath(path: string): boolean {
  const normalized = path.replaceAll('\\', '/')
  return (
    normalized.length > 0 &&
    !isAbsolute(path) &&
    normalized !== '..' &&
    !normalized.startsWith('../') &&
    !normalized.includes('/../')
  )
}

function isRuntimeImageMarker(value: unknown): value is RuntimeImageMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    hasExactValue(value, 'schemaVersion', 2) &&
    hasSafeSegment(value, 'imageKey') &&
    hasString(value, 'applicationVersion') &&
    hasString(value, 'electronVersion') &&
    hasString(value, 'architecture') &&
    hasString(value, 'completedAt') &&
    hasSafeRelativePath(value, 'providerEntryRelativePath') &&
    'runtimeDataFiles' in value &&
    isRuntimeDataFingerprintList(value.runtimeDataFiles) &&
    'sourceFiles' in value &&
    isRuntimeFileStatFingerprintList(value.sourceFiles) &&
    'imageFiles' in value &&
    isRuntimeFileStatFingerprintList(value.imageFiles)
  )
}

function isRuntimeDataFingerprintList(value: unknown): value is readonly RuntimeDataFingerprint[] {
  if (!Array.isArray(value)) return false
  const names = new Set<string>()
  for (const entry of value) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('name' in entry) ||
      typeof entry.name !== 'string' ||
      !allowedRuntimeDataFileNames.has(entry.name) ||
      names.has(entry.name) ||
      !('sha256' in entry) ||
      typeof entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(entry.sha256)
    ) {
      return false
    }
    names.add(entry.name)
  }
  return requiredRuntimeDataFileNames.every((name) => names.has(name))
}

function isRuntimeFileStatFingerprintList(
  value: unknown
): value is readonly RuntimeFileStatFingerprint[] {
  if (!Array.isArray(value) || value.length === 0) return false
  const paths = new Set<string>()
  for (const entry of value) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      !('relativePath' in entry) ||
      typeof entry.relativePath !== 'string' ||
      !isSafeRelativePath(entry.relativePath) ||
      paths.has(entry.relativePath) ||
      !hasNonNegativeNumber(entry, 'size') ||
      !hasNonNegativeNumber(entry, 'mtimeMs') ||
      !hasNonNegativeNumber(entry, 'ctimeMs')
    ) {
      return false
    }
    paths.add(entry.relativePath)
  }
  return true
}

function hasString(value: object, key: string): boolean {
  return key in value && typeof (value as Record<string, unknown>)[key] === 'string'
}

function hasSafeRelativePath(value: object, key: string): boolean {
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'string' && isSafeRelativePath(candidate)
}

function hasSafeSegment(value: object, key: string): boolean {
  const candidate = (value as Record<string, unknown>)[key]
  return (
    typeof candidate === 'string' &&
    candidate.length > 0 &&
    candidate.length <= 160 &&
    /^[A-Za-z0-9._-]+$/.test(candidate)
  )
}

function hasNonNegativeNumber(value: object, key: string): boolean {
  const candidate = (value as Record<string, unknown>)[key]
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
}

function hasExactValue(value: object, key: string, expected: unknown): boolean {
  return (value as Record<string, unknown>)[key] === expected
}
