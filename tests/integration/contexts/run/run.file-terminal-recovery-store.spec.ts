import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  FileTerminalRecoveryStore,
  type TerminalRecoveryRecord
} from '../../../../src/contexts/run/infrastructure/persistence/FileTerminalRecoveryStore'

describe('file terminal recovery store', () => {
  let rootDirectory = ''

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'cleancode-terminal-recovery-'))
  })

  afterEach(async () => {
    await rm(rootDirectory, { force: true, recursive: true })
  })

  it('atomically checkpoints a session and replays only output after its sequence', async () => {
    const store = new FileTerminalRecoveryStore({ rootDirectory })
    const record = createRecord()

    await store.writeCheckpoint(record)
    await store.appendOutput(record.session, { sequence: 1, data: 'already checkpointed' })
    await store.appendOutput(record.session, { sequence: 2, data: '\r\nafter checkpoint' })

    const loaded = await new FileTerminalRecoveryStore({ rootDirectory }).load()

    expect(loaded.issues).toEqual([])
    expect(loaded.sessions).toHaveLength(1)
    expect(loaded.sessions[0]?.checkpoint).toEqual(record)
    expect(loaded.sessions[0]?.output).toEqual([{ sequence: 2, data: '\r\nafter checkpoint' }])

    const sessionDirectories = await readdir(join(rootDirectory, 'sessions'))
    const checkpointContents = await readFile(
      join(rootDirectory, 'sessions', sessionDirectories[0] ?? '', 'checkpoint.json'),
      'utf8'
    )
    expect(JSON.parse(checkpointContents)).toEqual(record)
  })

  it('appends an ordered output batch without changing the recovery log format', async () => {
    const store = new FileTerminalRecoveryStore({ rootDirectory })
    const record = createRecord()
    await store.writeCheckpoint(record)

    await store.appendOutputs(record.session, [
      { sequence: 2, data: 'first batch output\r\n' },
      { sequence: 3, data: 'second batch output\r\n' }
    ])

    const loaded = await new FileTerminalRecoveryStore({ rootDirectory }).load()
    expect(loaded.issues).toEqual([])
    expect(loaded.sessions[0]?.output).toEqual([
      { sequence: 2, data: 'first batch output\r\n' },
      { sequence: 3, data: 'second batch output\r\n' }
    ])
  })

  it('checks the output log byte budget against the complete batch', async () => {
    const record = createRecord()
    const store = new FileTerminalRecoveryStore({
      rootDirectory,
      limits: { maxOutputLogBytes: 180 }
    })
    await store.writeCheckpoint(record)

    const result = await store.appendOutputs(record.session, [
      { sequence: 2, data: 'x'.repeat(60) },
      { sequence: 3, data: 'y'.repeat(60) }
    ])

    expect(result).toBe('checkpoint-required')
  })

  it('requests compaction before an append log exceeds its byte budget', async () => {
    const record = createRecord()
    const store = new FileTerminalRecoveryStore({
      rootDirectory,
      limits: { maxOutputLogBytes: 100 }
    })
    await store.writeCheckpoint(record)

    const result = await store.appendOutput(record.session, {
      sequence: 2,
      data: 'x'.repeat(200)
    })

    expect(result).toBe('checkpoint-required')
  })

  it('requests compaction before appended output exceeds the global store budget', async () => {
    const record = createRecord()
    const store = new FileTerminalRecoveryStore({
      rootDirectory,
      limits: { maxTotalBytes: 20_000 }
    })
    await store.writeCheckpoint(record)

    const result = await store.appendOutput(record.session, {
      sequence: 2,
      data: 'x'.repeat(30_000)
    })

    expect(result).toBe('checkpoint-required')
  })

  it('rejects an oversized checkpoint without replacing the last valid checkpoint', async () => {
    const store = new FileTerminalRecoveryStore({
      rootDirectory,
      limits: { maxCheckpointBytes: 4_000 }
    })
    const valid = createRecord()
    await store.writeCheckpoint(valid)

    const oversized = {
      ...valid,
      model: { ...valid.model, content: 'x'.repeat(10_000) }
    }
    await expect(store.writeCheckpoint(oversized)).rejects.toMatchObject({
      code: 'TERMINAL_RECOVERY_STORAGE_LIMIT'
    })

    const loaded = await store.load()
    expect(loaded.sessions[0]?.checkpoint).toEqual(valid)
  })

  it('isolates corrupted recovery data instead of failing all other sessions', async () => {
    const store = new FileTerminalRecoveryStore({ rootDirectory })
    const first = createRecord()
    const second = createRecord({ sessionId: 'session-2', runId: 'run-2' })
    await store.writeCheckpoint(first)
    await store.writeCheckpoint(second)
    const sessionDirectories = await readdir(join(rootDirectory, 'sessions'))
    await writeFile(
      join(rootDirectory, 'sessions', sessionDirectories[0] ?? '', 'checkpoint.json'),
      '{broken',
      'utf8'
    )

    const loaded = await store.load()

    expect(loaded.sessions).toHaveLength(1)
    expect(loaded.issues).toEqual([expect.objectContaining({ reason: 'corrupted' })])
  })

  it('restores sessions from workspaces without an initialized Git branch', async () => {
    const store = new FileTerminalRecoveryStore({ rootDirectory })
    const record = createRecord({ gitBranch: null })

    await store.writeCheckpoint(record)

    const loaded = await store.load()
    expect(loaded.issues).toEqual([])
    expect(loaded.sessions[0]?.checkpoint).toEqual(record)
  })

  it('migrates legacy sessions to a deterministic dark terminal source theme', async () => {
    const store = new FileTerminalRecoveryStore({ rootDirectory })
    const current = createRecord()
    await store.writeCheckpoint(current)
    const sessionDirectory = await firstSessionDirectory(rootDirectory)
    const legacySession: Record<string, unknown> = { ...current.session }
    Reflect.deleteProperty(legacySession, 'terminalSourceTheme')
    await writeFile(
      join(sessionDirectory, 'checkpoint.json'),
      `${JSON.stringify({ ...current, schemaVersion: 1, session: legacySession })}\n`,
      'utf8'
    )

    const loaded = await store.load()

    expect(loaded.issues).toEqual([])
    expect(loaded.sessions[0]?.checkpoint).toMatchObject({
      schemaVersion: 2,
      session: { terminalSourceTheme: 'dark' }
    })
  })

  it('isolates an incomplete output tail without replaying partial data', async () => {
    const store = new FileTerminalRecoveryStore({ rootDirectory })
    const record = createRecord()
    await store.writeCheckpoint(record)
    const sessionDirectory = await firstSessionDirectory(rootDirectory)
    await writeFile(join(sessionDirectory, 'output.log'), '{"schemaVersion":1,"sequence":2', 'utf8')

    const loaded = await store.load()

    expect(loaded.sessions).toEqual([])
    expect(loaded.issues).toEqual([expect.objectContaining({ reason: 'corrupted' })])
  })

  it('reports unsupported checkpoint versions without blocking valid sessions', async () => {
    const store = new FileTerminalRecoveryStore({ rootDirectory })
    const unsupported = createRecord()
    const valid = createRecord({ sessionId: 'session-2', runId: 'run-2' })
    await store.writeCheckpoint(unsupported)
    await store.writeCheckpoint(valid)
    const sessionDirectories = await readdir(join(rootDirectory, 'sessions'))
    for (const directory of sessionDirectories) {
      const checkpointPath = join(rootDirectory, 'sessions', directory, 'checkpoint.json')
      const checkpoint = JSON.parse(
        await readFile(checkpointPath, 'utf8')
      ) as TerminalRecoveryRecord
      if (checkpoint.session.sessionId === unsupported.session.sessionId) {
        await writeFile(checkpointPath, `${JSON.stringify({ ...checkpoint, schemaVersion: 3 })}\n`)
      }
    }

    const loaded = await store.load()

    expect(loaded.sessions.map(({ checkpoint }) => checkpoint.session.sessionId)).toEqual([
      'session-2'
    ])
    expect(loaded.issues).toEqual([expect.objectContaining({ reason: 'unsupported-version' })])
  })

  it('prunes expired cold history while preserving a live checkpoint', async () => {
    const now = Date.parse('2026-07-21T12:00:00.000Z')
    const store = new FileTerminalRecoveryStore({
      rootDirectory,
      now: () => now,
      limits: { coldRetentionMs: 1_000 }
    })
    const cold = createRecord()
    const expiredCold = {
      ...cold,
      updatedAt: '2026-07-20T00:00:00.000Z',
      session: {
        ...cold.session,
        processId: null,
        status: 'exited' as const,
        recoveryKind: 'ended' as const
      }
    }
    const live = createRecord({ sessionId: 'session-2', runId: 'run-2' })
    await store.writeCheckpoint(expiredCold)
    await store.writeCheckpoint(live)

    const loaded = await store.load()

    expect(loaded.sessions.map(({ checkpoint }) => checkpoint.session.sessionId)).toEqual([
      'session-2'
    ])
  })
})

function createRecord(
  identityOverrides: Partial<ReturnType<typeof createIdentity>> = {}
): TerminalRecoveryRecord {
  const identity = createIdentity(identityOverrides)
  return {
    schemaVersion: 2,
    providerInstanceId: 'provider-1',
    updatedAt: '2026-07-21T00:00:00.000Z',
    session: {
      ...identity,
      id: identity.sessionId,
      terminalBlockId: identity.blockId,
      workingDirectory: '/work/app',
      processId: 1234,
      status: 'running',
      kind: 'interactive',
      retentionPolicy: 'keep-after-application-exit',
      recoveryKind: 'warm',
      terminalSourceTheme: 'dark',
      inputHistory: [],
      exitCode: null,
      failureReason: null
    },
    model: {
      schemaVersion: 1,
      identity,
      sequence: 1,
      scrollbackRows: 1000,
      unicodeVersion: '11',
      content: 'checkpoint',
      normalContent: 'checkpoint',
      transcript: 'checkpoint',
      dimensions: { columns: 80, rows: 24 },
      title: '',
      workingDirectory: '/work/app',
      modes: {
        applicationCursorKeysMode: false,
        applicationKeypadMode: false,
        bracketedPasteMode: false,
        insertMode: false,
        mouseTrackingMode: 'none',
        originMode: false,
        reverseWraparoundMode: false,
        sendFocusMode: false,
        synchronizedOutputMode: false,
        wraparoundMode: true
      }
    }
  }
}

function createIdentity(overrides: Partial<ReturnType<typeof identityShape>> = {}) {
  return { ...identityShape(), ...overrides }
}

function identityShape() {
  return {
    projectId: 'project-app',
    projectDirectory: '/work/app',
    workspaceId: 'main',
    workspaceDirectory: '/work/app',
    gitBranch: 'main' as string | null,
    blockId: 'block-1',
    sessionId: 'session-1',
    runId: 'run-1',
    generation: 1
  }
}

async function firstSessionDirectory(rootDirectory: string): Promise<string> {
  const directories = await readdir(join(rootDirectory, 'sessions'))
  return join(rootDirectory, 'sessions', directories[0] ?? '')
}
