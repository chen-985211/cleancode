import { randomUUID } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  utimes,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  acquireFileSystemMutationLock,
  type FileSystemMutationLockFileSystem
} from '../../../../src/contexts/run/infrastructure/provider/FileSystemMutationLock'

const fileSystemFault = {
  operation: null as 'readFile' | 'readdir' | 'stat' | null,
  path: '',
  remaining: 0
}

const faultingFileSystem: FileSystemMutationLockFileSystem = {
  mkdir: (path) => mkdir(path),
  open: (path, flags, mode) => open(path, flags, mode),
  readFile: async (path, encoding) => {
    throwIfFileSystemFault('readFile', path)
    return readFile(path, encoding)
  },
  readdir: async (path, options) => {
    throwIfFileSystemFault('readdir', path)
    return readdir(path, options)
  },
  rename: (source, destination) => rename(source, destination),
  rm: (path, options) => rm(path, options),
  stat: async (path) => {
    throwIfFileSystemFault('stat', path)
    return stat(path)
  }
}

describe('file-system mutation lock', () => {
  let rootDirectory = ''
  let lockDirectory = ''

  beforeEach(async () => {
    clearFileSystemFault()
    rootDirectory = await mkdtemp(join(tmpdir(), 'cc-file-system-lock-'))
    lockDirectory = join(rootDirectory, 'mutation.lock')
  })

  afterEach(async () => {
    await rm(rootDirectory, { force: true, recursive: true })
  })

  it('serializes three contenders without overlapping their critical sections', async () => {
    let activeCount = 0
    let maximumActiveCount = 0

    await Promise.all(
      Array.from({ length: 3 }, async () => {
        const lease = await acquireFileSystemMutationLock({
          directory: lockDirectory,
          fileSystem: faultingFileSystem,
          isProcessAlive: (processId) => processId === process.pid
        })
        activeCount += 1
        maximumActiveCount = Math.max(maximumActiveCount, activeCount)
        await delay(20)
        activeCount -= 1
        await lease.close()
      })
    )

    expect(maximumActiveCount).toBe(1)
    expect(await readdir(rootDirectory)).toEqual([])
  })

  it('reclaims a canonical lock only after confirming its owner is dead', async () => {
    await createLockArtifact(lockDirectory, 'dead-owner', 987_654_321)

    const lease = await acquireFileSystemMutationLock({
      directory: lockDirectory,
      fileSystem: faultingFileSystem,
      isProcessAlive: () => false
    })

    await lease.assertOwned()
    await lease.close()
    expect(await readdir(rootDirectory)).toEqual([])
  })

  it('reclaims a fresh lock when the PID was reused after its exact lease ended', async () => {
    await createLockArtifact(lockDirectory, 'reused-pid-owner', process.pid, {
      schemaVersion: 1,
      endpoint: missingEpochEndpoint(),
      leaseId: randomUUID()
    })

    const lease = await acquireFileSystemMutationLock({
      directory: lockDirectory,
      fileSystem: faultingFileSystem,
      isProcessAlive: (processId) => processId === process.pid
    })

    await lease.close()
    expect(await readdir(rootDirectory)).toEqual([])
  })

  it('rejects a mixed snapshot when the lock directory is replaced after its owner read', async () => {
    const displacedDirectory = `${lockDirectory}.displaced`
    const ownerPath = join(lockDirectory, 'owner.json')
    let replaceOnOwnerRead = false
    const replacingFileSystem: FileSystemMutationLockFileSystem = {
      ...faultingFileSystem,
      readFile: async (path, encoding) => {
        const contents = await readFile(path, encoding)
        if (replaceOnOwnerRead && path === ownerPath) {
          replaceOnOwnerRead = false
          await rename(lockDirectory, displacedDirectory)
          await mkdir(lockDirectory)
          await writeFile(ownerPath, contents, 'utf8')
        }
        return contents
      }
    }
    const lease = await acquireFileSystemMutationLock({
      directory: lockDirectory,
      fileSystem: replacingFileSystem,
      isProcessAlive: (processId) => processId === process.pid
    })
    replaceOnOwnerRead = true

    await expect(lease.assertOwned()).rejects.toThrow('ownership was lost')
    await lease.close()

    expect(await readFile(ownerPath, 'utf8')).toContain('ownerId')
  })

  it('keeps a live unique reclaim barrier until its owner closes', async () => {
    const first = await acquireFileSystemMutationLock({
      directory: lockDirectory,
      fileSystem: faultingFileSystem,
      isProcessAlive: (processId) => processId === process.pid
    })
    const fixedBarrier = `${lockDirectory}.reclaiming`
    const uniqueBarrier = `${lockDirectory}.reclaimed-interrupted`
    await rename(lockDirectory, fixedBarrier)
    await rename(fixedBarrier, uniqueBarrier)

    let secondSettled = false
    const secondPending = acquireFileSystemMutationLock({
      directory: lockDirectory,
      fileSystem: faultingFileSystem,
      isProcessAlive: (processId) => processId === process.pid
    }).finally(() => {
      secondSettled = true
    })
    await delay(75)

    expect(secondSettled).toBe(false)
    expect(await pathExists(uniqueBarrier)).toBe(true)
    await first.close()
    const second = await secondPending

    await second.assertOwned()
    await second.close()
    expect(await readdir(rootDirectory)).toEqual([])
  })

  it('removes an orphaned unique reclaim barrier whose owner is dead', async () => {
    await createLockArtifact(`${lockDirectory}.reclaimed-interrupted`, 'dead-owner', 987_654_321)

    const lease = await acquireFileSystemMutationLock({
      directory: lockDirectory,
      fileSystem: faultingFileSystem,
      isProcessAlive: () => false
    })

    await lease.close()
    expect(await readdir(rootDirectory)).toEqual([])
  })

  it.each([
    ['canonical', () => lockDirectory],
    ['unique reclaim barrier', () => `${lockDirectory}.reclaimed-interrupted`]
  ])('reclaims a corrupt future-dated %s after one monotonic grace period', async (_, path) => {
    const artifact = path()
    await mkdir(artifact)
    await writeFile(join(artifact, 'owner.json'), '{interrupted', 'utf8')
    const future = new Date(Date.now() + 24 * 60 * 60 * 1_000)
    await Promise.all([
      utimes(artifact, future, future),
      utimes(join(artifact, 'owner.json'), future, future)
    ])

    const lease = await acquireFileSystemMutationLock({
      directory: lockDirectory,
      fileSystem: faultingFileSystem,
      isProcessAlive: () => false
    })

    await lease.close()
    expect(await readdir(rootDirectory)).toEqual([])
  })

  it('times out instead of stealing a guard from a live process', async () => {
    await createLockArtifact(lockDirectory, 'live-owner', process.pid)

    await expect(
      acquireFileSystemMutationLock({
        directory: lockDirectory,
        fileSystem: faultingFileSystem,
        isProcessAlive: (processId) => processId === process.pid,
        timeoutMs: 50
      })
    ).rejects.toThrow('Timed out waiting for file-system mutation lock')
  })

  it.each([
    {
      operation: 'stat' as const,
      target: () => `${lockDirectory}.reclaiming`
    },
    {
      operation: 'readdir' as const,
      target: () => rootDirectory
    },
    {
      operation: 'readFile' as const,
      target: () => join(lockDirectory, 'owner.json')
    }
  ])('fails closed when $operation is access denied', async ({ operation, target }) => {
    const first = await acquireFileSystemMutationLock({
      directory: lockDirectory,
      fileSystem: faultingFileSystem,
      isProcessAlive: (processId) => processId === process.pid
    })
    setFileSystemFault(operation, target())

    await expect(
      acquireFileSystemMutationLock({
        directory: lockDirectory,
        fileSystem: faultingFileSystem,
        isProcessAlive: (processId) => processId === process.pid,
        timeoutMs: 50
      })
    ).rejects.toMatchObject({ code: 'EACCES' })

    await first.assertOwned()
    await first.close()
    expect(await readdir(rootDirectory)).toEqual([])
  })

  it('retries a transient access error while closing', async () => {
    const lease = await acquireFileSystemMutationLock({
      directory: lockDirectory,
      fileSystem: faultingFileSystem,
      isProcessAlive: (processId) => processId === process.pid
    })
    setFileSystemFault('readdir', rootDirectory)

    await lease.close()

    expect(await readdir(rootDirectory)).toEqual([])
  })
})

function setFileSystemFault(operation: 'readFile' | 'readdir' | 'stat', path: string): void {
  fileSystemFault.operation = operation
  fileSystemFault.path = path
  fileSystemFault.remaining = 1
}

function clearFileSystemFault(): void {
  fileSystemFault.operation = null
  fileSystemFault.path = ''
  fileSystemFault.remaining = 0
}

function throwIfFileSystemFault(operation: 'readFile' | 'readdir' | 'stat', path: string): void {
  if (
    fileSystemFault.operation !== operation ||
    path !== fileSystemFault.path ||
    fileSystemFault.remaining <= 0
  ) {
    return
  }
  fileSystemFault.remaining -= 1
  throw Object.assign(new Error('access denied'), { code: 'EACCES' })
}

async function createLockArtifact(
  directory: string,
  ownerId: string,
  processId: number,
  processEpoch?: { readonly schemaVersion: 1; readonly endpoint: string; readonly leaseId: string }
): Promise<void> {
  await mkdir(directory)
  await writeFile(
    join(directory, 'owner.json'),
    `${JSON.stringify({
      schemaVersion: 1,
      ownerId,
      processId,
      acquiredAt: new Date().toISOString(),
      ...(processEpoch ? { processEpoch } : {})
    })}\n`,
    'utf8'
  )
}

function missingEpochEndpoint(): string {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\cc-missing-epoch-${randomUUID()}`
    : `/tmp/cc-missing-epoch-${randomUUID().slice(0, 12)}.sock`
}

async function pathExists(path: string): Promise<boolean> {
  return (await readdir(path).catch(() => null)) !== null
}

function delay(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}
