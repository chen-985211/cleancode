import { existsSync } from 'node:fs'
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  utimes,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  TerminalProviderRuntimeImageManager,
  terminalProviderRetiredRuntimeImageRetentionMs,
  type TerminalProviderRuntimeImageOptions
} from '../../../src/platform/electron-main/terminalProviderRuntimeImage'
import { clearRuntimeImageRetirement } from '../../../src/platform/electron-main/terminalProviderRuntimeImageSupport'

const retiredImageKey = '0.1.6-retired000000000'

describe('TerminalProviderRuntimeImageManager warm start', () => {
  let temporaryDirectory = ''
  let installDirectory = ''
  let runtimeRootDirectory = ''
  let providerStateDirectory = ''
  let archiveReadFile: ReturnType<typeof vi.fn<(path: string) => Promise<Buffer>>>

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'cc-provider-runtime-warm-'))
    installDirectory = join(temporaryDirectory, 'installed-app')
    runtimeRootDirectory = join(temporaryDirectory, 'runtime-images')
    providerStateDirectory = join(temporaryDirectory, 'provider-state')
    archiveReadFile = vi.fn((path: string) => readFile(path))
    await createFixture(installDirectory)
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { force: true, recursive: true })
  })

  it('does not read closure contents when app-ready pruning finds no image', async () => {
    await createManager().pruneUnusedImages()

    expect(archiveReadFile).not.toHaveBeenCalled()
  })

  it('uses only directory metadata on a second-manager warm hit and subsequent prune', async () => {
    const first = await createManager().resolveLaunchTarget()
    archiveReadFile.mockClear()

    const secondManager = createManager()
    const second = await secondManager.resolveLaunchTarget()

    expect(second).toEqual(first)
    expect(archiveReadFile).not.toHaveBeenCalled()

    await secondManager.pruneUnusedImages()

    expect(archiveReadFile).not.toHaveBeenCalled()
  })

  it('starts retirement when old-image metadata is revoked and deletes only after the grace', async () => {
    const now = Date.now()
    const manager = createManager()
    await manager.resolveLaunchTarget()
    const retiredImageDirectory = join(runtimeRootDirectory, retiredImageKey)
    await mkdir(retiredImageDirectory, { recursive: true })
    const materializedAt = new Date(now - terminalProviderRetiredRuntimeImageRetentionMs * 2)
    await utimes(retiredImageDirectory, materializedAt, materializedAt)

    await manager.pruneUnusedImages()

    expect(existsSync(retiredImageDirectory)).toBe(true)

    const retiredAt = new Date(now - terminalProviderRetiredRuntimeImageRetentionMs - 1)
    await utimes(
      join(runtimeRootDirectory, '.retired-images+state', retiredImageKey),
      retiredAt,
      retiredAt
    )
    await manager.pruneUnusedImages()

    expect(existsSync(retiredImageDirectory)).toBe(false)
  })

  it('restarts retirement grace after a warm launch reserves an expired image', async () => {
    const firstManager = createManager({ applicationVersion: '0.1.6' })
    const first = await firstManager.resolveLaunchTarget()
    const replacementManager = createManager({ applicationVersion: '0.1.8' })
    await replacementManager.resolveLaunchTarget()
    const retirementMarker = join(
      runtimeRootDirectory,
      '.retired-images+state',
      first.runtimeImageKey!
    )
    await mkdir(retirementMarker, { recursive: true })
    const expiredAt = new Date(Date.now() - terminalProviderRetiredRuntimeImageRetentionMs - 1)
    await utimes(retirementMarker, expiredAt, expiredAt)

    expect(await createManager({ applicationVersion: '0.1.6' }).resolveLaunchTarget()).toEqual(
      first
    )
    expect(existsSync(retirementMarker)).toBe(false)

    await replacementManager.pruneUnusedImages()

    expect(existsSync(first.executablePath)).toBe(true)
    expect(existsSync(retirementMarker)).toBe(true)
  })

  it('rejects a reservation when an existing retirement marker cannot be refreshed or removed', async () => {
    const retirementMarker = join(runtimeRootDirectory, '.retired-images+state', retiredImageKey)
    await mkdir(retirementMarker, { recursive: true })
    const accessDenied = Object.assign(new Error('access denied'), { code: 'EACCES' })

    await expect(
      clearRuntimeImageRetirement(runtimeRootDirectory, retiredImageKey, {
        rm: vi.fn().mockRejectedValue(accessDenied),
        stat,
        utimes: vi.fn().mockRejectedValue(accessDenied)
      })
    ).resolves.toBe(false)
    expect(existsSync(retirementMarker)).toBe(true)
  })

  it('falls back when publish-lock ownership is lost after a cold image reservation', async () => {
    const onFailure = vi.fn()
    let successorLockDirectory = ''
    const missingMarker = Object.assign(new Error('missing retirement marker'), { code: 'ENOENT' })
    const target = await createManager({
      onFailure,
      retirementFileSystem: {
        rm,
        stat,
        utimes: async () => {
          const lockEntry = (await readdir(runtimeRootDirectory)).find((entry) =>
            entry.endsWith('.publish-lock')
          )
          expect(lockEntry).toBeTruthy()
          successorLockDirectory = join(runtimeRootDirectory, lockEntry!)
          await rm(successorLockDirectory, { force: true, recursive: true })
          await mkdir(successorLockDirectory)
          await writeFile(
            join(successorLockDirectory, 'owner.json'),
            `${JSON.stringify({
              schemaVersion: 1,
              ownerId: 'successor-after-reservation',
              processId: process.pid,
              acquiredAt: new Date().toISOString()
            })}\n`,
            'utf8'
          )
          throw missingMarker
        }
      }
    }).resolveLaunchTarget()

    expect(target.runtimeImageKey).toBeUndefined()
    expect(target.executablePath).toBe(join(installDirectory, 'CleanCode.exe'))
    expect(onFailure).toHaveBeenCalledOnce()
    expect(existsSync(successorLockDirectory)).toBe(true)
  })

  it.each([
    [
      'ordinary write',
      async (imageDirectory: string) => {
        await writeFile(
          join(imageDirectory, 'cleancode-terminal-provider.exe'),
          'corrupted',
          'utf8'
        )
      }
    ],
    [
      'missing closure file',
      async (imageDirectory: string) => {
        await rm(join(imageDirectory, 'resources', 'app.asar'))
      }
    ],
    [
      'corrupt marker',
      async (imageDirectory: string) => {
        await writeFile(join(imageDirectory, '.materialized.json'), '{broken', 'utf8')
      }
    ]
  ])('falls back to full validation and repairs after an image %s', async (_name, mutate) => {
    const first = await createManager().resolveLaunchTarget()
    const imageDirectory = join(runtimeRootDirectory, first.runtimeImageKey!)
    await mutate(imageDirectory)
    archiveReadFile.mockClear()

    const repaired = await createManager().resolveLaunchTarget()

    expect(repaired).toEqual(first)
    expect(archiveReadFile).toHaveBeenCalledWith(join(installDirectory, 'resources', 'app.asar'))
    expect(readPaths()).toContain(join(installDirectory, 'CleanCode.exe'))
    expect(await readFile(join(imageDirectory, 'cleancode-terminal-provider.exe'), 'utf8')).toBe(
      'electron-host'
    )
    expect(await readFile(join(imageDirectory, 'resources', 'app.asar'), 'utf8')).toBe(
      'application-archive-v1'
    )
  })

  it('rehashes a same-version source after stat drift and refreshes the warm fingerprint', async () => {
    const first = await createManager().resolveLaunchTarget()
    const sourceArchivePath = join(installDirectory, 'resources', 'app.asar')
    const sourceArchiveStat = await stat(sourceArchivePath)
    const changedTime = new Date(sourceArchiveStat.mtimeMs + 5_000)
    await utimes(sourceArchivePath, changedTime, changedTime)
    archiveReadFile.mockClear()

    const revalidated = await createManager().resolveLaunchTarget()

    expect(revalidated).toEqual(first)
    expect(archiveReadFile).toHaveBeenCalledWith(sourceArchivePath)
    archiveReadFile.mockClear()

    expect(await createManager().resolveLaunchTarget()).toEqual(first)
    expect(archiveReadFile).not.toHaveBeenCalled()
  })

  it('binds the exact build, Provider entry, and copied node-pty closure in the marker', async () => {
    const target = await createManager().resolveLaunchTarget()
    const marker = JSON.parse(
      await readFile(
        join(runtimeRootDirectory, target.runtimeImageKey!, '.materialized.json'),
        'utf8'
      )
    ) as Record<string, unknown>
    const sourcePaths = (marker.sourceFiles as Array<{ relativePath: string }>).map(
      ({ relativePath }) => relativePath
    )
    const imagePaths = (marker.imageFiles as Array<{ relativePath: string }>).map(
      ({ relativePath }) => relativePath
    )

    expect(marker).toMatchObject({
      applicationVersion: '0.1.7',
      electronVersion: '43.0.0',
      architecture: 'x64',
      providerEntryRelativePath: 'resources/app.asar/out/main/terminal-runtime-provider.js'
    })
    expect(sourcePaths.filter((path) => path.includes('node-pty'))).toHaveLength(6)
    expect(imagePaths.filter((path) => path.includes('node-pty'))).toHaveLength(6)
    expect(sourcePaths).toContain('CleanCode.exe')
    expect(imagePaths).toContain('cleancode-terminal-provider.exe')
  })

  function createManager(
    overrides: Partial<TerminalProviderRuntimeImageOptions> = {}
  ): TerminalProviderRuntimeImageManager {
    return new TerminalProviderRuntimeImageManager({
      archiveFileSystem: { access, copyFile, readFile: archiveReadFile, stat },
      applicationVersion: '0.1.7',
      architecture: 'x64',
      electronVersion: '43.0.0',
      executablePath: join(installDirectory, 'CleanCode.exe'),
      isPackaged: true,
      platform: 'win32',
      providerEntryPath: providerEntryPath(installDirectory),
      providerStateDirectory,
      resourcesPath: join(installDirectory, 'resources'),
      runtimeRootDirectory,
      ...overrides
    })
  }

  function readPaths(): string[] {
    return archiveReadFile.mock.calls.map(([path]) => String(path))
  }
})

async function createFixture(installDirectory: string): Promise<void> {
  const nodePtyDirectory = join(
    installDirectory,
    'resources',
    'app.asar.unpacked',
    'node_modules',
    'node-pty'
  )
  const releaseDirectory = join(nodePtyDirectory, 'build', 'Release')
  await Promise.all([
    mkdir(join(releaseDirectory, 'conpty'), { recursive: true }),
    mkdir(join(nodePtyDirectory, 'lib'), { recursive: true })
  ])
  await Promise.all([
    writeFile(join(installDirectory, 'CleanCode.exe'), 'electron-host'),
    writeFile(join(installDirectory, 'icudtl.dat'), 'icu'),
    writeFile(join(installDirectory, 'snapshot_blob.bin'), 'snapshot'),
    writeFile(join(installDirectory, 'v8_context_snapshot.bin'), 'v8-snapshot'),
    writeFile(join(installDirectory, 'resources', 'app.asar'), 'application-archive-v1'),
    writeFile(join(releaseDirectory, 'conpty.node'), 'native-binding'),
    writeFile(join(releaseDirectory, 'conpty_console_list.node'), 'console-list-binding'),
    writeFile(join(releaseDirectory, 'pty.node'), 'winpty-binding'),
    writeFile(join(releaseDirectory, 'conpty', 'conpty.dll'), 'conpty'),
    writeFile(join(releaseDirectory, 'conpty', 'OpenConsole.exe'), 'console'),
    writeFile(join(nodePtyDirectory, 'lib', 'windowsTerminal.js'), 'module.exports = {}')
  ])
}

function providerEntryPath(installDirectory: string): string {
  return join(
    installDirectory,
    'resources',
    'app.asar',
    'out',
    'main',
    'terminal-runtime-provider.js'
  )
}
