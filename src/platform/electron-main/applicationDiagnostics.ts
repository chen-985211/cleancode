import { randomUUID } from 'node:crypto'
import { open, rename, rm, type FileHandle } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const applicationDiagnosticsWindowMinutes = 30
export const applicationDiagnosticsMaxBytes = 5 * 1024 * 1024

const maximumDiagnosticTextLength = 128 * 1024
const maximumLogTailBytes = 768 * 1024

type ApplicationDiagnosticLogSource = 'main' | 'terminal-provider'

interface ApplicationDiagnosticLogInput {
  readonly contents: string
  readonly source: ApplicationDiagnosticLogSource
  readonly truncated?: boolean
}

interface ApplicationDiagnosticLogRecord {
  readonly source: ApplicationDiagnosticLogSource
  readonly timestamp: string
  readonly level?: 'debug' | 'info' | 'warn' | 'error'
  readonly scope?: string
  readonly operation?: string
  readonly outcome?: 'success' | 'failure'
  readonly durationMs?: number
  readonly correlationId?: string
  readonly event?: string
  readonly phase?: string
  readonly message?: string
  readonly error?: {
    readonly code?: string
    readonly isExpected?: boolean
    readonly message?: string
  }
}

export interface ApplicationDiagnosticsSnapshot {
  readonly schemaVersion: 1
  readonly generatedAt: string
  readonly application: {
    readonly isPackaged: boolean
    readonly name: string
    readonly version: string
  }
  readonly runtime: {
    readonly architecture: string
    readonly chromiumVersion: string
    readonly electronVersion: string
    readonly nodeVersion: string
    readonly osRelease: string
    readonly platform: string
  }
  readonly collection: {
    readonly includedRecordCount: number
    readonly maximumBytes: number
    readonly skippedLineCount: number
    readonly truncated: boolean
    readonly windowEndedAt: string
    readonly windowMinutes: number
    readonly windowStartedAt: string
  }
  readonly logs: readonly ApplicationDiagnosticLogRecord[]
}

interface CreateApplicationDiagnosticsSnapshotInput {
  readonly application: ApplicationDiagnosticsSnapshot['application']
  readonly generatedAt: string
  readonly logs: readonly ApplicationDiagnosticLogInput[]
  readonly redaction: {
    readonly appStateDirectory: string
    readonly homeDirectory: string
  }
  readonly runtime: ApplicationDiagnosticsSnapshot['runtime']
}

export interface CollectApplicationDiagnosticsInput {
  readonly application: ApplicationDiagnosticsSnapshot['application']
  readonly appStateDirectory: string
  readonly generatedAt: string
  readonly homeDirectory: string
  readonly providerStateDirectory: string
  readonly runtime: ApplicationDiagnosticsSnapshot['runtime']
}

export async function collectApplicationDiagnostics(
  input: CollectApplicationDiagnosticsInput
): Promise<ApplicationDiagnosticsSnapshot> {
  const logs = await Promise.all([
    readLogSeries(join(input.appStateDirectory, 'logs', 'main.log'), 'main'),
    readLogSeries(join(input.providerStateDirectory, 'provider.log'), 'terminal-provider')
  ])
  return createApplicationDiagnosticsSnapshot({
    application: input.application,
    generatedAt: input.generatedAt,
    logs: logs.flat(),
    redaction: {
      appStateDirectory: input.appStateDirectory,
      homeDirectory: input.homeDirectory
    },
    runtime: input.runtime
  })
}

export async function writeApplicationDiagnosticsFile(
  path: string,
  snapshot: ApplicationDiagnosticsSnapshot
): Promise<void> {
  const temporaryPath = join(
    dirname(path),
    `.cleancode-diagnostics-${process.pid}-${randomUUID()}.tmp`
  )
  let temporaryFile: FileHandle | null = null

  try {
    temporaryFile = await open(temporaryPath, 'wx', 0o600)
    await temporaryFile.writeFile(serializeApplicationDiagnosticsSnapshot(snapshot), 'utf8')
    await temporaryFile.sync()
    await temporaryFile.close()
    temporaryFile = null
    await rename(temporaryPath, path)
  } catch (error) {
    await temporaryFile?.close().catch(() => undefined)
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

export function createApplicationDiagnosticsSnapshot(
  input: CreateApplicationDiagnosticsSnapshotInput
): ApplicationDiagnosticsSnapshot {
  const generatedAtMs = Date.parse(input.generatedAt)
  const windowStartedAtMs = generatedAtMs - applicationDiagnosticsWindowMinutes * 60 * 1000
  let skippedLineCount = 0
  const logs = input.logs
    .flatMap((log) =>
      log.contents.split(/\r?\n/).flatMap((line) => {
        if (line.trim().length === 0) return []
        const parsed = parseRecord(line)
        if (!parsed) {
          skippedLineCount += 1
          return []
        }
        const timestampMs = Date.parse(readString(parsed.timestamp) ?? '')
        if (!Number.isFinite(timestampMs)) {
          skippedLineCount += 1
          return []
        }
        if (timestampMs < windowStartedAtMs || timestampMs > generatedAtMs) return []
        const record = createAllowlistedRecord(parsed, log.source, input.redaction)
        if (!record) {
          skippedLineCount += 1
          return []
        }
        return [record]
      })
    )
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))

  const snapshot: ApplicationDiagnosticsSnapshot = {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    application: input.application,
    runtime: input.runtime,
    collection: {
      includedRecordCount: logs.length,
      maximumBytes: applicationDiagnosticsMaxBytes,
      skippedLineCount,
      truncated: input.logs.some((log) => log.truncated === true),
      windowEndedAt: input.generatedAt,
      windowMinutes: applicationDiagnosticsWindowMinutes,
      windowStartedAt: new Date(windowStartedAtMs).toISOString()
    },
    logs
  }

  return constrainSnapshotSize(snapshot)
}

export function serializeApplicationDiagnosticsSnapshot(
  snapshot: ApplicationDiagnosticsSnapshot
): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

function createAllowlistedRecord(
  record: Record<string, unknown>,
  source: ApplicationDiagnosticLogSource,
  redaction: CreateApplicationDiagnosticsSnapshotInput['redaction']
): ApplicationDiagnosticLogRecord | null {
  const timestamp = readString(record.timestamp)
  if (!timestamp) return null
  if (source === 'terminal-provider') {
    const event = readString(record.event)
    if (!event) return null
    return compactRecord({
      source,
      timestamp,
      event: sanitizeDiagnosticText(event, redaction),
      phase: sanitizeOptionalText(record.phase, redaction),
      message: sanitizeOptionalText(record.message, redaction)
    })
  }

  const level = readLogLevel(record.level)
  const scope = readString(record.scope)
  const operation = readString(record.operation)
  if (!level || !scope || !operation) return null
  const outcome: ApplicationDiagnosticLogRecord['outcome'] =
    record.outcome === 'success' || record.outcome === 'failure' ? record.outcome : undefined
  const error = isRecord(record.error)
    ? compactRecord({
        code: sanitizeOptionalText(record.error.code, redaction),
        isExpected:
          typeof record.error.isExpected === 'boolean' ? record.error.isExpected : undefined,
        message: sanitizeOptionalText(record.error.message, redaction)
      })
    : undefined

  return compactRecord({
    source,
    timestamp,
    level,
    scope: sanitizeDiagnosticText(scope, redaction),
    operation: sanitizeDiagnosticText(operation, redaction),
    outcome,
    durationMs:
      typeof record.durationMs === 'number' && Number.isFinite(record.durationMs)
        ? Math.max(0, record.durationMs)
        : undefined,
    correlationId: sanitizeOptionalText(record.correlationId, redaction),
    error: error && Object.keys(error).length > 0 ? error : undefined
  })
}

function sanitizeDiagnosticText(
  value: string,
  redaction: CreateApplicationDiagnosticsSnapshotInput['redaction']
): string {
  let sanitized = value
  const knownPaths: readonly [string, string][] = [
    [redaction.appStateDirectory, '<APP_DATA>'],
    [redaction.homeDirectory, '<HOME>']
  ]
  for (const [path, replacement] of knownPaths) {
    if (path.length > 0) sanitized = sanitized.replaceAll(path, replacement)
  }

  sanitized = sanitized
    .replace(/(["'])((?:[A-Za-z]:\\|\\\\|\/)[^\r\n]*?)\1/g, '$1<PATH>$1')
    .replace(/\bfile:\/\/\/[^\s"',;]+/gi, 'file:///<PATH>')
    .replace(/(?:[A-Za-z]:\\|\\\\)[^\s"',;)}\]]+/g, '<PATH>')
    .replace(/(^|[\s("'=:[{,])\/(?!\/)(?:[^/\s"'<>]+\/)*[^/\s"'<>),;}\]]+/g, '$1<PATH>')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer <REDACTED>')
    .replace(
      /(["']?)\b(authorization|proxy-authorization|cookie|set-cookie)\1(\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\r\n]+)/gi,
      redactCredentialMatch
    )
    .replace(
      /(["']?)\b(access[_-]?token|refresh[_-]?token|id[_-]?token|auth[_-]?token|token|password|passwd|client[_-]?secret|secret|private[_-]?key|api[_-]?key)\1(\s*[:=]\s*)("[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}\]]+)/gi,
      redactCredentialMatch
    )

  return sanitized.slice(0, maximumDiagnosticTextLength)
}

function redactCredentialMatch(
  _match: string,
  keyQuote: string,
  key: string,
  separator: string,
  value: string
): string {
  const valueQuote =
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
      ? value[0]
      : ''
  return `${keyQuote}${key}${keyQuote}${separator}${valueQuote}<REDACTED>${valueQuote}`
}

async function readLogSeries(
  path: string,
  source: ApplicationDiagnosticLogSource
): Promise<ApplicationDiagnosticLogInput[]> {
  const paths = [`${path}.3`, `${path}.2`, `${path}.1`, path]
  const logs = await Promise.all(paths.map((candidate) => readLogTail(candidate, source)))
  return logs.filter((log): log is ApplicationDiagnosticLogInput => log !== null)
}

async function readLogTail(
  path: string,
  source: ApplicationDiagnosticLogSource
): Promise<ApplicationDiagnosticLogInput | null> {
  let handle
  try {
    handle = await open(path, 'r')
    const { size } = await handle.stat()
    const readLength = Math.min(size, maximumLogTailBytes)
    const offset = Math.max(0, size - readLength)
    const buffer = Buffer.alloc(readLength)
    await handle.read(buffer, 0, readLength, offset)
    let contents = buffer.toString('utf8')
    if (offset > 0) {
      const firstNewline = contents.indexOf('\n')
      contents = firstNewline >= 0 ? contents.slice(firstNewline + 1) : ''
    }
    return { contents, source, truncated: offset > 0 }
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

function sanitizeOptionalText(
  value: unknown,
  redaction: CreateApplicationDiagnosticsSnapshotInput['redaction']
): string | undefined {
  const text = readString(value)
  return text ? sanitizeDiagnosticText(text, redaction) : undefined
}

function constrainSnapshotSize(
  snapshot: ApplicationDiagnosticsSnapshot
): ApplicationDiagnosticsSnapshot {
  if (
    Buffer.byteLength(serializeApplicationDiagnosticsSnapshot(snapshot), 'utf8') <=
    applicationDiagnosticsMaxBytes
  ) {
    return snapshot
  }

  let lowerBound = 0
  let upperBound = snapshot.logs.length
  let constrained = withTruncatedLogs(snapshot, [])
  while (lowerBound <= upperBound) {
    const removedCount = Math.floor((lowerBound + upperBound) / 2)
    const candidate = withTruncatedLogs(snapshot, snapshot.logs.slice(removedCount))
    if (
      Buffer.byteLength(serializeApplicationDiagnosticsSnapshot(candidate), 'utf8') <=
      applicationDiagnosticsMaxBytes
    ) {
      constrained = candidate
      upperBound = removedCount - 1
    } else {
      lowerBound = removedCount + 1
    }
  }
  return constrained
}

function withTruncatedLogs(
  snapshot: ApplicationDiagnosticsSnapshot,
  logs: readonly ApplicationDiagnosticLogRecord[]
): ApplicationDiagnosticsSnapshot {
  return {
    ...snapshot,
    collection: {
      ...snapshot.collection,
      includedRecordCount: logs.length,
      truncated: true
    },
    logs
  }
}

function compactRecord<TRecord extends Record<string, unknown>>(record: TRecord): TRecord {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  ) as TRecord
}

function parseRecord(line: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(line)
    return isRecord(value) ? value : null
  } catch {
    return null
  }
}

function readLogLevel(value: unknown): ApplicationDiagnosticLogRecord['level'] {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error'
    ? value
    : undefined
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
