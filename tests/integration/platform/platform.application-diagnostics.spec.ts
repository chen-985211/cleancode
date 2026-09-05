import { chmod, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  collectApplicationDiagnostics,
  serializeApplicationDiagnosticsSnapshot,
  writeApplicationDiagnosticsFile
} from '../../../src/platform/electron-main/applicationDiagnostics'

describe('platform application diagnostics', () => {
  let directory = ''

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cleancode-application-diagnostics-'))
  })

  afterEach(async () => {
    await rm(directory, { force: true, recursive: true })
  })

  it('collects rotated application and provider logs without reading unrelated state', async () => {
    const logsDirectory = join(directory, 'logs')
    const providerDirectory = join(directory, 'terminal-runtime-provider')
    await mkdir(logsDirectory, { recursive: true })
    await mkdir(providerDirectory, { recursive: true })
    await writeFile(
      join(logsDirectory, 'main.log.1'),
      diagnosticLine('2026-09-05T11:40:00.000Z', 'rotatedFailure'),
      'utf8'
    )
    await writeFile(
      join(logsDirectory, 'main.log'),
      diagnosticLine('2026-09-05T11:59:00.000Z', 'currentFailure'),
      'utf8'
    )
    await writeFile(
      join(providerDirectory, 'provider.log'),
      JSON.stringify({
        timestamp: '2026-09-05T11:50:00.000Z',
        event: 'provider-start-failed',
        message: `Failed under ${directory}`
      }),
      'utf8'
    )
    await writeFile(join(directory, 'agent-audit.jsonl'), 'private-agent-input', 'utf8')
    await mkdir(join(providerDirectory, 'recovery'), { recursive: true })
    await writeFile(
      join(providerDirectory, 'recovery', 'terminal-output.jsonl'),
      'private-terminal-output',
      'utf8'
    )

    const snapshot = await collectApplicationDiagnostics({
      ...environment(),
      appStateDirectory: directory,
      generatedAt: '2026-09-05T12:00:00.000Z',
      providerStateDirectory: providerDirectory
    })

    expect(snapshot.logs.map((record) => record.timestamp)).toEqual([
      '2026-09-05T11:40:00.000Z',
      '2026-09-05T11:50:00.000Z',
      '2026-09-05T11:59:00.000Z'
    ])
    const serialized = serializeApplicationDiagnosticsSnapshot(snapshot)
    expect(serialized).toContain('<APP_DATA>')
    expect(serialized).not.toContain(directory)
    expect(serialized).not.toContain('private-agent-input')
    expect(serialized).not.toContain('private-terminal-output')

    const destination = join(directory, 'exported-diagnostics.json')
    await writeApplicationDiagnosticsFile(destination, snapshot)
    await expect(readFile(destination, 'utf8')).resolves.toBe(serialized)
  })

  it('still creates an empty diagnostic snapshot when log files are unavailable', async () => {
    const snapshot = await collectApplicationDiagnostics({
      ...environment(),
      appStateDirectory: directory,
      generatedAt: '2026-09-05T12:00:00.000Z',
      providerStateDirectory: join(directory, 'missing-provider')
    })

    expect(snapshot.logs).toEqual([])
    expect(snapshot.collection).toMatchObject({
      includedRecordCount: 0,
      skippedLineCount: 0,
      truncated: false
    })
  })

  it('reports a file-system failure instead of claiming that export succeeded', async () => {
    const snapshot = await collectApplicationDiagnostics({
      ...environment(),
      appStateDirectory: directory,
      generatedAt: '2026-09-05T12:00:00.000Z',
      providerStateDirectory: join(directory, 'missing-provider')
    })

    await expect(writeApplicationDiagnosticsFile(directory, snapshot)).rejects.toThrow()
  })

  it('replaces an existing diagnostic file with private output', async () => {
    const snapshot = await collectApplicationDiagnostics({
      ...environment(),
      appStateDirectory: directory,
      generatedAt: '2026-09-05T12:00:00.000Z',
      providerStateDirectory: join(directory, 'missing-provider')
    })
    const destination = join(directory, 'existing-diagnostics.json')
    await writeFile(destination, 'old contents', 'utf8')
    if (process.platform !== 'win32') await chmod(destination, 0o644)

    await writeApplicationDiagnosticsFile(destination, snapshot)

    await expect(readFile(destination, 'utf8')).resolves.toBe(
      serializeApplicationDiagnosticsSnapshot(snapshot)
    )
    if (process.platform !== 'win32') {
      expect((await stat(destination)).mode & 0o777).toBe(0o600)
    }
  })
})

function diagnosticLine(timestamp: string, operation: string): string {
  return JSON.stringify({
    timestamp,
    level: 'error',
    scope: 'platform.application',
    operation,
    outcome: 'failure',
    error: { code: 'UNEXPECTED_ERROR', message: `Failed in ${operation}` }
  })
}

function environment() {
  return {
    application: { isPackaged: false, name: 'CleanCode', version: '0.1.15' },
    homeDirectory: '/Users/alice',
    runtime: {
      architecture: 'arm64',
      chromiumVersion: '152.0.0',
      electronVersion: '43.0.0',
      nodeVersion: '24.0.0',
      osRelease: '25.0.0',
      platform: 'darwin'
    }
  } as const
}
