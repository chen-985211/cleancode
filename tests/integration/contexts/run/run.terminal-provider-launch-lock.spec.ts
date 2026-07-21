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

  it('reclaims an expired lock even when its recorded process id has been reused', async () => {
    await writeFile(
      lockPath,
      `${JSON.stringify({ processId: process.pid, ownerId: randomUUID() })}\n`,
      { mode: 0o600 }
    )
    await ageLock(lockPath)

    const lease = await acquireProviderLaunchLock(lockPath)

    expect(lease).not.toBeNull()
    await lease?.close()
  })

  it('uses the recorded acquisition time when a stale lock was touched later', async () => {
    await writeFile(
      lockPath,
      `${JSON.stringify({
        schemaVersion: 1,
        ownerId: randomUUID(),
        processId: process.pid,
        acquiredAt: new Date(Date.now() - 60_000).toISOString()
      })}\n`,
      { mode: 0o600 }
    )

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

  it('does not delete a successor lock when an old lease closes late', async () => {
    const lease = await acquireProviderLaunchLock(lockPath)
    expect(lease).not.toBeNull()
    await rm(lockPath, { force: true })
    const successor = `${JSON.stringify({ processId: process.pid, ownerId: randomUUID() })}\n`
    await writeFile(lockPath, successor, { mode: 0o600 })

    await lease?.close()

    expect(await readFile(lockPath, 'utf8')).toBe(successor)
  })
})

async function ageLock(path: string): Promise<void> {
  const old = new Date(Date.now() - 60_000)
  await utimes(path, old, old)
}
