import { randomUUID } from 'node:crypto'
import type { Dirent } from 'node:fs'
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
import type { FileHandle } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'

import {
  acquireRuntimeImagePublishLock,
  type RuntimeImagePublishLockFileSystem
} from '../../../src/platform/electron-main/TerminalProviderRuntimeImagePublishLock'

type FileSystemOperationName =
  'mkdir' | 'open' | 'readFile' | 'readdir' | 'rename' | 'rm' | 'stat' | 'sync'

interface FileSystemOperation {
  readonly name: FileSystemOperationName
  readonly path: string
  readonly destination?: string
  readonly flags?: 'w' | 'wx'
}

interface FileSystemController {
  before?(operation: FileSystemOperation): Promise<void> | void
  after?(operation: FileSystemOperation): Promise<void> | void
}

describe('terminal Provider runtime image publish lock I/O safety', () => {
  let rootDirectory = ''

  beforeEach(async () => {
    rootDirectory = await mkdtemp(join(tmpdir(), 'cc-publish-lock-io-'))
  })

  afterEach(async () => {
    await rm(rootDirectory, { force: true, recursive: true })
  })

  it('does not replace a live lock when owner reads are access denied', async () => {
    const imageKey = 'owner-read'
    const lockDirectory = join(rootDirectory, `${imageKey}.publish-lock`)
    const ownerPath = join(lockDirectory, 'owner.json')
    let denyOwnerRead = false
    const fileSystem = createControlledFileSystem({
      before(operation) {
        if (denyOwnerRead && operation.name === 'readFile' && operation.path === ownerPath) {
          denyOwnerRead = false
          throw accessDeniedError()
        }
      }
    })
    const first = await acquireRuntimeImagePublishLock(rootDirectory, imageKey, isCurrentProcess, {
      fileSystem
    })

    denyOwnerRead = true
    await expect(
      acquireRuntimeImagePublishLock(rootDirectory, imageKey, isCurrentProcess, { fileSystem })
    ).rejects.toMatchObject({ code: 'EACCES' })

    await first.assertOwned()
    await first.close()
    expect(await readdir(rootDirectory)).toEqual([])
  })

  it('rejects a mixed snapshot when the lock directory is replaced after its owner read', async () => {
    const imageKey = 'snapshot-directory-aba'
    const lockDirectory = join(rootDirectory, `${imageKey}.publish-lock`)
    const displacedDirectory = `${lockDirectory}.displaced`
    const ownerPath = join(lockDirectory, 'owner.json')
    let replaceOnOwnerRead = false
    const fileSystem = createControlledFileSystem({
      after: async (operation) => {
        if (!replaceOnOwnerRead || operation.name !== 'readFile' || operation.path !== ownerPath) {
          return
        }
        replaceOnOwnerRead = false
        await rename(lockDirectory, displacedDirectory)
        await mkdir(lockDirectory)
        await Promise.all([
          writeFile(ownerPath, await readFile(join(displacedDirectory, 'owner.json'), 'utf8')),
          writeFile(
            join(lockDirectory, '.heartbeat'),
            await readFile(join(displacedDirectory, '.heartbeat'), 'utf8')
          )
        ])
      }
    })
    const lease = await acquireRuntimeImagePublishLock(rootDirectory, imageKey, isCurrentProcess, {
      fileSystem
    })
    replaceOnOwnerRead = true

    await expect(lease.assertOwned()).rejects.toThrow('publish lock ownership was lost')
    await lease.close()

    expect(await readFile(ownerPath, 'utf8')).toContain('ownerId')
  })

  it('reclaims a fresh publish lock when the PID belongs to a later process epoch', async () => {
    const imageKey = 'reused-pid'
    const lockDirectory = join(rootDirectory, `${imageKey}.publish-lock`)
    await mkdir(lockDirectory)
    await writeFile(
      join(lockDirectory, 'owner.json'),
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
      'utf8'
    )
    await writeFile(join(lockDirectory, '.heartbeat'), `${new Date().toISOString()}\n`, 'utf8')

    const lease = await acquireRuntimeImagePublishLock(rootDirectory, imageKey, isCurrentProcess)

    await lease.close()
    expect(await readdir(rootDirectory)).toEqual([])
  })

  it('rolls back the new lock when the mutation guard post-check is denied', async () => {
    const imageKey = 'guard-post-check'
    const lockDirectory = join(rootDirectory, `${imageKey}.publish-lock`)
    const ownerPath = join(lockDirectory, 'owner.json')
    const fixedGuardPath = `${lockDirectory}.reclaim-guard.reclaiming`
    let publishOwnerRead = false
    let injected = false
    const fileSystem = createControlledFileSystem({
      after(operation) {
        if (operation.name === 'readFile' && operation.path === ownerPath) {
          publishOwnerRead = true
        }
      },
      before(operation) {
        if (
          publishOwnerRead &&
          !injected &&
          operation.name === 'stat' &&
          operation.path === fixedGuardPath
        ) {
          injected = true
          throw accessDeniedError()
        }
      }
    })

    await expect(
      acquireRuntimeImagePublishLock(rootDirectory, imageKey, isCurrentProcess, { fileSystem })
    ).rejects.toMatchObject({ code: 'EACCES' })

    expect(injected).toBe(true)
    expect(await readdir(rootDirectory)).toEqual([])
  })

  it('reclaims an unchanged incomplete lock with a future mtime after the monotonic grace', async () => {
    const imageKey = 'future-mtime'
    const lockDirectory = join(rootDirectory, `${imageKey}.publish-lock`)
    const startedAtMs = Date.now()
    await mkdir(lockDirectory)
    const future = new Date(startedAtMs + 365 * 24 * 60 * 60 * 1_000)
    await utimes(lockDirectory, future, future)
    let currentTimeMs = startedAtMs
    let monotonicTimeMs = 0
    const delays: number[] = []
    const dateNow = vi.spyOn(Date, 'now').mockImplementation(() => currentTimeMs)
    const performanceNow = vi.spyOn(performance, 'now').mockImplementation(() => monotonicTimeMs)
    const setTimeoutMock = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((
      callback: (...args: unknown[]) => void,
      duration?: number
    ) => {
      const durationMs = duration ?? 0
      delays.push(durationMs)
      currentTimeMs += durationMs
      monotonicTimeMs += durationMs
      queueMicrotask(callback)
      return 0 as unknown as NodeJS.Timeout
    }) as typeof setTimeout)

    let lease: Awaited<ReturnType<typeof acquireRuntimeImagePublishLock>> | null = null
    try {
      lease = await acquireRuntimeImagePublishLock(rootDirectory, imageKey, isCurrentProcess)
      await lease.assertOwned()
      await lease.close()
    } finally {
      setTimeoutMock.mockRestore()
      performanceNow.mockRestore()
      dateNow.mockRestore()
      await lease?.close()
    }

    expect(delays).toEqual([250])
    expect(currentTimeMs).toBe(startedAtMs + 250)
    expect(await readdir(rootDirectory)).toEqual([])
  })

  it.each([
    ['owner sync', 'owner-sync'],
    ['heartbeat sync', 'heartbeat-sync'],
    ['final snapshot', 'final-snapshot']
  ] as const)(
    'releases the old guard, reacquires a guard, and removes a partial lock after %s failure',
    async (_label, failureStage) => {
      const imageKey = `creation-${failureStage}`
      const lockDirectory = join(rootDirectory, `${imageKey}.publish-lock`)
      const ownerPath = join(lockDirectory, 'owner.json')
      const heartbeatPath = join(lockDirectory, '.heartbeat')
      const guardDirectory = `${lockDirectory}.reclaim-guard`
      const guardEvents: string[] = []
      let heartbeatSynchronized = false
      let injected = false
      const fileSystem = createControlledFileSystem({
        after(operation) {
          recordGuardEvent(operation, guardDirectory, guardEvents)
          if (operation.name === 'sync' && operation.path === heartbeatPath) {
            heartbeatSynchronized = true
          }
        },
        before(operation) {
          if (injected) return
          const shouldFail =
            (failureStage === 'owner-sync' &&
              operation.name === 'sync' &&
              operation.path === ownerPath) ||
            (failureStage === 'heartbeat-sync' &&
              operation.name === 'sync' &&
              operation.path === heartbeatPath) ||
            (failureStage === 'final-snapshot' &&
              heartbeatSynchronized &&
              operation.name === 'readFile' &&
              operation.path === ownerPath)
          if (shouldFail) {
            injected = true
            throw accessDeniedError()
          }
        }
      })

      await expect(
        acquireRuntimeImagePublishLock(rootDirectory, imageKey, isCurrentProcess, { fileSystem })
      ).rejects.toMatchObject({ code: 'EACCES' })

      expect(injected).toBe(true)
      expect(guardEvents).toEqual(['acquired', 'released', 'acquired', 'released'])
      expect(await readdir(rootDirectory)).toEqual([])
    }
  )

  it('does not roll back a successor owner in the same directory identity', async () => {
    const imageKey = 'successor-owner'
    const lockDirectory = join(rootDirectory, `${imageKey}.publish-lock`)
    const ownerPath = join(lockDirectory, 'owner.json')
    const guardDirectory = `${lockDirectory}.reclaim-guard`
    const successorOwnerId = 'successor-owner-id'
    let heartbeatSynchronized = false
    let injected = false
    let successorInstalled = false
    const fileSystem = createControlledFileSystem({
      after: async (operation) => {
        if (operation.name === 'sync' && operation.path === join(lockDirectory, '.heartbeat')) {
          heartbeatSynchronized = true
        }
        if (
          !successorInstalled &&
          operation.name === 'rename' &&
          operation.path === guardDirectory &&
          operation.destination === `${guardDirectory}.reclaiming`
        ) {
          successorInstalled = true
          await writeFile(
            ownerPath,
            `${JSON.stringify(createOwnerRecord(successorOwnerId))}\n`,
            'utf8'
          )
        }
      },
      before(operation) {
        if (
          !injected &&
          heartbeatSynchronized &&
          operation.name === 'readFile' &&
          operation.path === ownerPath
        ) {
          injected = true
          throw accessDeniedError()
        }
      }
    })

    await expect(
      acquireRuntimeImagePublishLock(rootDirectory, imageKey, isCurrentProcess, { fileSystem })
    ).rejects.toMatchObject({ code: 'EACCES' })

    const successor = JSON.parse(await readFile(ownerPath, 'utf8')) as { ownerId: string }
    expect(successorInstalled).toBe(true)
    expect(successor.ownerId).toBe(successorOwnerId)
    expect(await remainingGuardArtifacts(rootDirectory, guardDirectory)).toEqual([])
  })

  it('does not roll back a replacement directory with the failed owner bytes', async () => {
    const imageKey = 'successor-directory'
    const lockDirectory = join(rootDirectory, `${imageKey}.publish-lock`)
    const displacedDirectory = `${lockDirectory}.displaced`
    const ownerPath = join(lockDirectory, 'owner.json')
    const heartbeatPath = join(lockDirectory, '.heartbeat')
    const guardDirectory = `${lockDirectory}.reclaim-guard`
    let heartbeatSynchronized = false
    let injected = false
    let successorInstalled = false
    let displacedInode = 0
    const fileSystem = createControlledFileSystem({
      after: async (operation) => {
        if (operation.name === 'sync' && operation.path === heartbeatPath) {
          heartbeatSynchronized = true
        }
        if (
          !successorInstalled &&
          operation.name === 'rename' &&
          operation.path === guardDirectory &&
          operation.destination === `${guardDirectory}.reclaiming`
        ) {
          successorInstalled = true
          const ownerContents = await readFile(ownerPath, 'utf8')
          const heartbeatContents = await readFile(heartbeatPath, 'utf8')
          await rename(lockDirectory, displacedDirectory)
          displacedInode = (await stat(displacedDirectory)).ino
          await mkdir(lockDirectory)
          await writeFile(ownerPath, ownerContents, 'utf8')
          await writeFile(heartbeatPath, heartbeatContents, 'utf8')
        }
      },
      before(operation) {
        if (
          !injected &&
          heartbeatSynchronized &&
          operation.name === 'readFile' &&
          operation.path === ownerPath
        ) {
          injected = true
          throw accessDeniedError()
        }
      }
    })

    await expect(
      acquireRuntimeImagePublishLock(rootDirectory, imageKey, isCurrentProcess, { fileSystem })
    ).rejects.toMatchObject({ code: 'EACCES' })

    expect(successorInstalled).toBe(true)
    expect((await stat(lockDirectory)).ino).not.toBe(displacedInode)
    expect(await readFile(ownerPath, 'utf8')).toContain('ownerId')
    expect(await remainingGuardArtifacts(rootDirectory, guardDirectory)).toEqual([])
  })
})

function createControlledFileSystem(
  controller: FileSystemController
): RuntimeImagePublishLockFileSystem {
  return {
    async mkdir(path) {
      const operation = { name: 'mkdir', path } as const
      await controller.before?.(operation)
      const result = await mkdir(path)
      await controller.after?.(operation)
      return result
    },
    async open(path, flags, mode) {
      const operation = { flags, name: 'open', path } as const
      await controller.before?.(operation)
      const handle = await open(path, flags, mode)
      await controller.after?.(operation)
      return wrapFileHandle(handle, path, controller)
    },
    async readFile(path, encoding) {
      const operation = { name: 'readFile', path } as const
      await controller.before?.(operation)
      const result = await readFile(path, encoding)
      await controller.after?.(operation)
      return result
    },
    async readdir(path, options) {
      const operation = { name: 'readdir', path } as const
      await controller.before?.(operation)
      const result = (await readdir(path, options)) as Dirent[]
      await controller.after?.(operation)
      return result
    },
    async rename(source, destination) {
      const operation = { destination, name: 'rename', path: source } as const
      await controller.before?.(operation)
      await rename(source, destination)
      await controller.after?.(operation)
    },
    async rm(path, options) {
      const operation = { name: 'rm', path } as const
      await controller.before?.(operation)
      await rm(path, options)
      await controller.after?.(operation)
    },
    async stat(path) {
      const operation = { name: 'stat', path } as const
      await controller.before?.(operation)
      const result = await stat(path)
      await controller.after?.(operation)
      return result
    }
  }
}

function wrapFileHandle(
  handle: FileHandle,
  path: string,
  controller: FileSystemController
): FileHandle {
  return new Proxy(handle, {
    get(target, property) {
      if (property === 'sync') {
        return async () => {
          const operation = { name: 'sync', path } as const
          await controller.before?.(operation)
          await target.sync()
          await controller.after?.(operation)
        }
      }
      const value: unknown = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}

function recordGuardEvent(
  operation: FileSystemOperation,
  guardDirectory: string,
  events: string[]
): void {
  if (
    operation.name === 'rename' &&
    operation.path.startsWith(`${guardDirectory}.candidate-`) &&
    operation.destination === guardDirectory
  ) {
    events.push('acquired')
  }
  if (
    operation.name === 'rename' &&
    operation.path === guardDirectory &&
    operation.destination === `${guardDirectory}.reclaiming`
  ) {
    events.push('released')
  }
}

async function remainingGuardArtifacts(root: string, guardDirectory: string): Promise<string[]> {
  const guardName = guardDirectory.slice(root.length + 1)
  return (await readdir(root)).filter((entry) => entry.startsWith(guardName))
}

function createOwnerRecord(ownerId: string) {
  return {
    schemaVersion: 1,
    ownerId,
    processId: process.pid,
    acquiredAt: new Date().toISOString()
  }
}

function isCurrentProcess(processId: number): boolean {
  return processId === process.pid
}

function missingEpochEndpoint(): string {
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\cc-missing-epoch-${randomUUID()}`
    : `/tmp/cc-missing-epoch-${randomUUID().slice(0, 12)}.sock`
}

function accessDeniedError(): Error & { code: string } {
  return Object.assign(new Error('access denied'), { code: 'EACCES' })
}
