import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { acquireProviderLaunchLock } from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClientSupport'

describe('terminal provider launch lock', () => {
  let rootDirectory = ''
  let lockPath = ''

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'cc-provider-launch-lock-'))
    lockPath = join(rootDirectory, 'provider-launch.lock')
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await rm(rootDirectory, { force: true, recursive: true })
  })

  it.each([
    { content: '', description: 'empty' },
    { content: '{interrupted', description: 'corrupt' }
  ])(
    'reclaims an old $description lock left by interrupted initialization',
    async ({ content }) => {
      await writeFile(lockPath, content, { mode: 0o600 })
      await ageLock(lockPath)

      const lease = await acquireProviderLaunchLock(lockPath)

      expect(lease).not.toBeNull()
      await lease?.close()
    }
  )

  it('does not steal an expired lock while its recorded process is still alive', async () => {
    const content = `${JSON.stringify({ processId: process.pid, ownerId: randomUUID() })}\n`
    await writeFile(lockPath, content, { mode: 0o600 })
    await ageLock(lockPath)

    const lease = await acquireProviderLaunchLock(lockPath)

    expect(lease).toBeNull()
    expect(await readFile(lockPath, 'utf8')).toBe(content)
  })

  it('keeps a live owner even when its recorded acquisition time is old', async () => {
    const content = `${JSON.stringify({
      schemaVersion: 1,
      ownerId: randomUUID(),
      processId: process.pid,
      acquiredAt: new Date(Date.now() - 60_000).toISOString()
    })}\n`
    await writeFile(lockPath, content, { mode: 0o600 })

    const lease = await acquireProviderLaunchLock(lockPath)

    expect(lease).toBeNull()
    expect(await readFile(lockPath, 'utf8')).toBe(content)
  })

  it('reclaims a stale heartbeat even when an unrelated live process reused the PID', async () => {
    await writeFile(
      lockPath,
      `${JSON.stringify({
        schemaVersion: 1,
        ownerId: randomUUID(),
        processId: process.pid,
        acquiredAt: new Date().toISOString()
      })}\n`,
      { mode: 0o600 }
    )
    await ageLock(lockPath)

    const lease = await acquireProviderLaunchLock(lockPath)

    expect(lease).not.toBeNull()
    await lease?.close()
  })

  it('reclaims a fresh launch lock when its exact process lease is already gone', async () => {
    await writeFile(
      lockPath,
      `${JSON.stringify({
        schemaVersion: 1,
        ownerId: randomUUID(),
        processId: process.pid,
        acquiredAt: new Date().toISOString(),
        processEpoch: {
          schemaVersion: 1,
          endpoint: missingEpochEndpoint(),
          leaseId: randomUUID()
        }
      })}\n`,
      { mode: 0o600 }
    )

    const lease = await acquireProviderLaunchLock(lockPath)

    expect(lease).not.toBeNull()
    await lease?.close()
  })

  it('reclaims a live-PID lock whose heartbeat timestamp is implausibly in the future', async () => {
    await writeFile(
      lockPath,
      `${JSON.stringify({
        schemaVersion: 1,
        ownerId: randomUUID(),
        processId: process.pid,
        acquiredAt: new Date().toISOString()
      })}\n`,
      { mode: 0o600 }
    )
    const future = new Date(Date.now() + 24 * 60 * 60 * 1_000)
    await utimes(lockPath, future, future)

    const lease = await acquireProviderLaunchLock(lockPath)

    expect(lease).not.toBeNull()
    await lease?.close()
  })

  it('reclaims a lock whose recorded owner process is dead', async () => {
    await writeFile(
      lockPath,
      `${JSON.stringify({
        schemaVersion: 1,
        ownerId: randomUUID(),
        processId: 987_654_321,
        acquiredAt: new Date().toISOString()
      })}\n`,
      { mode: 0o600 }
    )

    const lease = await acquireProviderLaunchLock(lockPath)

    expect(lease).not.toBeNull()
    await lease?.close()
  })

  it('treats an access-denied liveness probe as conservatively alive', async () => {
    const content = `${JSON.stringify({ processId: 42 })}\n`
    await writeFile(lockPath, content, { mode: 0o600 })
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('access denied'), { code: 'EPERM' })
    })

    const lease = await acquireProviderLaunchLock(lockPath)

    expect(lease).toBeNull()
    expect(await readFile(lockPath, 'utf8')).toBe(content)
  })

  it('reclaims a lock only when the liveness probe reports no such process', async () => {
    await writeFile(lockPath, `${JSON.stringify({ processId: 42 })}\n`, { mode: 0o600 })
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('no such process'), { code: 'ESRCH' })
    })

    const lease = await acquireProviderLaunchLock(lockPath)

    expect(lease).not.toBeNull()
    await lease?.close()
  })

  it('reclaims a fresh empty lock after allowing an interrupted writer to finish', async () => {
    await writeFile(lockPath, '', { mode: 0o600 })

    const lease = await acquireProviderLaunchLock(lockPath)

    expect(lease).not.toBeNull()
    await lease?.close()
  })

  it('reclaims an interrupted lock even when its mtime is in the future', async () => {
    await writeFile(lockPath, '{interrupted', { mode: 0o600 })
    const future = new Date(Date.now() + 24 * 60 * 60 * 1_000)
    await utimes(lockPath, future, future)

    const lease = await acquireProviderLaunchLock(lockPath)

    expect(lease).not.toBeNull()
    await lease?.close()
  })

  it('keeps a live owner that finishes writing during the initialization grace period', async () => {
    await writeFile(lockPath, '', { mode: 0o600 })
    const completedContent = `${JSON.stringify({ processId: process.pid })}\n`
    const completeWrite = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        void writeFile(lockPath, completedContent, { mode: 0o600 }).then(resolve, reject)
      }, 25)
      timeout.unref()
    })

    const lease = await acquireProviderLaunchLock(lockPath)
    await completeWrite

    expect(lease).toBeNull()
    expect(await readFile(lockPath, 'utf8')).toBe(completedContent)
  })

  it('keeps a fresh lock owned by a live launch coordinator', async () => {
    const content = `${JSON.stringify({ processId: process.pid })}\n`
    await writeFile(lockPath, content, { mode: 0o600 })

    const lease = await acquireProviderLaunchLock(lockPath)

    expect(lease).toBeNull()
    expect(await readFile(lockPath, 'utf8')).toBe(content)
  })

  it('refreshes a long-running launch coordinator before the stale deadline', async () => {
    const lease = await acquireProviderLaunchLock(lockPath)
    expect(lease).not.toBeNull()
    await ageLock(lockPath)

    await lease?.refresh()
    const competingLease = await acquireProviderLaunchLock(lockPath)

    expect(competingLease).toBeNull()
    await lease?.close()
  })

  it('does not delete a successor lock when an old lease closes late', async () => {
    const lease = await acquireProviderLaunchLock(lockPath)
    expect(lease).not.toBeNull()
    await rm(lockPath, { force: true })
    const successor = `${JSON.stringify({ processId: process.pid, ownerId: randomUUID() })}\n`
    await writeFile(lockPath, successor, { mode: 0o600 })

    await expect(lease?.assertOwned()).rejects.toThrow(
      'Terminal Provider launch lock ownership was lost.'
    )
    await lease?.close()

    expect(await readFile(lockPath, 'utf8')).toBe(successor)
  })
})

async function ageLock(path: string): Promise<void> {
  const old = new Date(Date.now() - 60_000)
  await utimes(path, old, old)
}

function missingEpochEndpoint(): string {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\cc-missing-epoch-${randomUUID()}`
    : `/tmp/cc-missing-epoch-${randomUUID().slice(0, 12)}.sock`
}
