import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { FileSystemMutationLockFileSystem } from '../../../../src/contexts/run/infrastructure/provider/FileSystemMutationLock'
import { acquireProviderLaunchLock } from '../../../../src/contexts/run/infrastructure/provider/PersistentTerminalProviderClientSupport'

const fileSystemFault = {
  code: 'EACCES',
  operation: null as 'readFile' | 'stat' | 'sync' | null,
  path: '',
  remaining: 0,
  whenPathExists: ''
}

const faultingFileSystem: FileSystemMutationLockFileSystem = {
  mkdir: (path) => mkdir(path),
  open: async (path, flags, mode) => wrapHandle(path, await open(path, flags, mode)),
  readFile: async (path, encoding) => {
    throwIfFileSystemFault('readFile', path)
    return readFile(path, encoding)
  },
  readdir: (path, options) => readdir(path, options),
  rename: (source, destination) => rename(source, destination),
  rm: (path, options) => rm(path, options),
  stat: async (path) => {
    throwIfFileSystemFault('stat', path)
    return stat(path)
  }
}

describe('terminal Provider lock I/O safety', () => {
  let rootDirectory = ''

  beforeEach(async () => {
    clearFileSystemFault()
    rootDirectory = await mkdtemp(join(tmpdir(), 'cc-provider-lock-io-'))
  })

  afterEach(async () => {
    await rm(rootDirectory, { force: true, recursive: true })
  })

  it('does not replace a live launch lock when reading it is access denied', async () => {
    const lockPath = join(rootDirectory, 'provider-launch.lock')
    const first = await acquireProviderLaunchLock(lockPath, { fileSystem: faultingFileSystem })
    expect(first).not.toBeNull()
    denyNextRead(lockPath)

    await expect(
      acquireProviderLaunchLock(lockPath, { fileSystem: faultingFileSystem })
    ).rejects.toMatchObject({ code: 'EACCES' })

    await first?.assertOwned()
    await first?.close()
    expect(await readdir(rootDirectory)).toEqual([])
  })

  it('keeps the launch lock bytes readable after a failed contender', async () => {
    const lockPath = join(rootDirectory, 'provider-launch.lock')
    const first = await acquireProviderLaunchLock(lockPath, { fileSystem: faultingFileSystem })
    expect(first).not.toBeNull()

    expect(await readFile(lockPath, 'utf8')).toContain('ownerId')
    await first?.close()
  })

  it.each(['EMFILE', 'ENFILE'] as const)(
    'retries a transient %s failure while releasing the launch lock',
    async (code) => {
      const lockPath = join(rootDirectory, 'provider-launch.lock')
      const lease = await acquireProviderLaunchLock(lockPath, { fileSystem: faultingFileSystem })
      expect(lease).not.toBeNull()
      failNextRead(lockPath, code)

      await expect(lease?.close()).resolves.toBeUndefined()

      expect(await readdir(rootDirectory)).toEqual([])
    }
  )

  it('rolls back a launch lock when the mutation guard post-check fails', async () => {
    const lockPath = join(rootDirectory, 'provider-launch.lock')
    denyNextStatWhenPathExists(`${lockPath}.reclaim-guard.reclaiming`, lockPath)

    await expect(
      acquireProviderLaunchLock(lockPath, { fileSystem: faultingFileSystem })
    ).rejects.toMatchObject({ code: 'EACCES' })

    expect(await readdir(rootDirectory)).toEqual([])
    const recovered = await acquireProviderLaunchLock(lockPath, {
      fileSystem: faultingFileSystem
    })
    expect(recovered).not.toBeNull()
    await recovered?.close()
  })

  it('rolls back a launch lock when initialization fails after writing its owner', async () => {
    const lockPath = join(rootDirectory, 'provider-launch.lock')
    denyNextSync(lockPath)

    await expect(
      acquireProviderLaunchLock(lockPath, { fileSystem: faultingFileSystem })
    ).rejects.toMatchObject({ code: 'EACCES' })

    expect(await readdir(rootDirectory)).toEqual([])
    const recovered = await acquireProviderLaunchLock(lockPath, {
      fileSystem: faultingFileSystem
    })
    expect(recovered).not.toBeNull()
    await recovered?.close()
  })
})

function denyNextRead(path: string): void {
  failNextRead(path, 'EACCES')
}

function failNextRead(path: string, code: string): void {
  fileSystemFault.code = code
  fileSystemFault.operation = 'readFile'
  fileSystemFault.path = path
  fileSystemFault.remaining = 1
  fileSystemFault.whenPathExists = ''
}

function denyNextStatWhenPathExists(path: string, whenPathExists: string): void {
  fileSystemFault.operation = 'stat'
  fileSystemFault.path = path
  fileSystemFault.remaining = 1
  fileSystemFault.whenPathExists = whenPathExists
}

function denyNextSync(path: string): void {
  fileSystemFault.operation = 'sync'
  fileSystemFault.path = path
  fileSystemFault.remaining = 1
  fileSystemFault.whenPathExists = ''
}

function clearFileSystemFault(): void {
  fileSystemFault.code = 'EACCES'
  fileSystemFault.operation = null
  fileSystemFault.path = ''
  fileSystemFault.remaining = 0
  fileSystemFault.whenPathExists = ''
}

function wrapHandle(path: string, handle: FileHandle): FileHandle {
  return new Proxy(handle, {
    get(target, property) {
      if (property === 'sync') {
        return async () => {
          throwIfFileSystemFault('sync', path)
          return target.sync()
        }
      }
      const value: unknown = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}

function throwIfFileSystemFault(operation: 'readFile' | 'stat' | 'sync', path: string): void {
  if (
    fileSystemFault.operation !== operation ||
    fileSystemFault.path !== path ||
    fileSystemFault.remaining <= 0 ||
    (fileSystemFault.whenPathExists.length > 0 && !existsSync(fileSystemFault.whenPathExists))
  ) {
    return
  }
  fileSystemFault.remaining -= 1
  throw Object.assign(new Error('injected file-system failure'), { code: fileSystemFault.code })
}
