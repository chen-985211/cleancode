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
  createTerminalProviderHeartbeat,
  createTerminalProviderLivenessReference,
  getTerminalProviderHeartbeatPath,
  terminalProviderHeartbeatIntervalMs,
  terminalProviderHeartbeatStaleAfterMs,
  type TerminalProviderHeartbeatLease,
  type TerminalProviderHeartbeatOwner,
  type TerminalProviderLivenessReference
} from '../../../src/contexts/run/infrastructure/provider/TerminalProviderHeartbeat'
import {
  TerminalProviderRuntimeImageManager,
  terminalProviderRetiredRuntimeImageRetentionMs,
  type TerminalProviderRuntimeImageOptions
} from '../../../src/platform/electron-main/terminalProviderRuntimeImage'

type HeartbeatPinMetadata = TerminalProviderHeartbeatOwner & {
  readonly liveness: TerminalProviderLivenessReference
  readonly runtimeImageKey: string
}

const candidateImageKey = '0.1.6-pinned0000000000'
const unusedImageKey = '0.1.5-stale00000000000'

describe('TerminalProviderRuntimeImageManager', () => {
  let temporaryDirectory = ''
  let installDirectory = ''
  let runtimeRootDirectory = ''
  let providerStateDirectory = ''
  let heartbeatLeases: TerminalProviderHeartbeatLease[] = []

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'cc-provider-runtime-image-'))
    installDirectory = join(temporaryDirectory, 'installed-app')
    runtimeRootDirectory = join(temporaryDirectory, 'local-app-data', 'terminal-provider-host')
    providerStateDirectory = join(temporaryDirectory, 'provider-state')
    heartbeatLeases = []
    await createPackagedWindowsFixture(installDirectory)
  })

  afterEach(async () => {
    await Promise.all(heartbeatLeases.map((lease) => lease.close().catch(() => undefined)))
    vi.useRealTimers()
    vi.restoreAllMocks()
    await rm(temporaryDirectory, { force: true, recursive: true })
  })

  it('atomically materializes the packaged Windows Provider closure under a renamed host', async () => {
    const manager = createManager()

    const target = await manager.resolveLaunchTarget()
    const imageDirectory = join(runtimeRootDirectory, target.runtimeImageKey!)

    expect(target.runtimeImageKey).toMatch(/^0\.1\.7-[a-f0-9]{16}$/)
    expect(target.executablePath).toBe(join(imageDirectory, 'cleancode-terminal-provider.exe'))
    expect(target.providerEntryPath).toBe(packagedProviderEntryPath(imageDirectory))
    expect(existsSync(target.executablePath)).toBe(true)
    expect(await readFile(join(imageDirectory, 'resources', 'app.asar'), 'utf8')).toBe(
      'application-archive-v1'
    )
    expect(
      existsSync(
        join(
          imageDirectory,
          'resources',
          'app.asar.unpacked',
          'node_modules',
          'node-pty',
          'build',
          'Release',
          'conpty.node'
        )
      )
    ).toBe(true)
    expect(existsSync(join(imageDirectory, 'ffmpeg.dll'))).toBe(false)
    const marker = JSON.parse(
      await readFile(join(imageDirectory, '.materialized.json'), 'utf8')
    ) as Record<string, unknown>
    expect(marker).toMatchObject({
      schemaVersion: 2,
      imageKey: target.runtimeImageKey,
      applicationVersion: '0.1.7',
      architecture: 'x64',
      electronVersion: '43.0.0',
      providerEntryRelativePath: 'resources/app.asar/out/main/terminal-runtime-provider.js',
      runtimeDataFiles: expect.arrayContaining([
        expect.objectContaining({ name: 'icudtl.dat', sha256: expect.any(String) }),
        expect.objectContaining({ name: 'snapshot_blob.bin', sha256: expect.any(String) }),
        expect.objectContaining({ name: 'v8_context_snapshot.bin', sha256: expect.any(String) })
      ])
    })
    expect((await readdir(runtimeRootDirectory)).some((entry) => entry.includes('.staging-'))).toBe(
      false
    )
  })

  it('reuses a complete immutable image without replacing it', async () => {
    const manager = createManager()
    const first = await manager.resolveLaunchTarget()
    const sentinel = join(runtimeRootDirectory, first.runtimeImageKey!, 'sentinel.txt')
    await writeFile(sentinel, 'keep', 'utf8')

    const second = await manager.resolveLaunchTarget()

    expect(second).toEqual(first)
    expect(await readFile(sentinel, 'utf8')).toBe('keep')
  })

  it('reuses a warm image in a new main process without reading large runtime contents', async () => {
    const first = await createManager().resolveLaunchTarget()
    const archiveReadFile = vi.fn(async (): Promise<Buffer> => {
      throw new Error('warm reuse must not read runtime contents')
    })
    const restartedManager = createManager({
      archiveFileSystem: {
        access,
        copyFile,
        readFile: archiveReadFile,
        stat
      }
    })

    const second = await restartedManager.resolveLaunchTarget()

    expect(second).toEqual(first)
    expect(archiveReadFile).not.toHaveBeenCalled()
  })

  it('does not hash runtime contents when pruning has no current image', async () => {
    const archiveReadFile = vi.fn((path: string) => readFile(path))
    const manager = createManager({
      archiveFileSystem: {
        access,
        copyFile,
        readFile: archiveReadFile,
        stat
      }
    })

    await manager.pruneUnusedImages()

    expect(archiveReadFile).not.toHaveBeenCalled()
    expect(existsSync(runtimeRootDirectory)).toBe(false)
  })

  it('converges concurrent publishers on one complete image', async () => {
    const [first, second] = await Promise.all([
      createManager().resolveLaunchTarget(),
      createManager().resolveLaunchTarget()
    ])

    expect(second).toEqual(first)
    expect(await readdir(runtimeRootDirectory)).toEqual([first.runtimeImageKey])
  })

  it('shares one cold source identity calculation across concurrent resolve and pruning', async () => {
    const sourceArchivePath = join(installDirectory, 'resources', 'app.asar')
    const archiveReadFile = vi.fn((path: string) => readFile(path))
    const manager = createManager({
      archiveFileSystem: {
        access,
        copyFile,
        readFile: archiveReadFile,
        stat
      }
    })

    await Promise.all([manager.resolveLaunchTarget(), manager.pruneUnusedImages()])

    expect(archiveReadFile.mock.calls.filter(([path]) => path === sourceArchivePath)).toHaveLength(
      1
    )
  })

  it('reclaims a fresh publish lock immediately when its owner process is dead', async () => {
    const first = await createManager().resolveLaunchTarget()
    await rm(join(runtimeRootDirectory, first.runtimeImageKey!), {
      force: true,
      recursive: true
    })
    const lockDirectory = join(runtimeRootDirectory, `${first.runtimeImageKey}.publish-lock`)
    await mkdir(lockDirectory)
    await writeFile(
      join(lockDirectory, 'owner.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        ownerId: 'dead-publisher',
        processId: 987_654_321,
        acquiredAt: new Date().toISOString()
      })}\n`,
      'utf8'
    )
    vi.useFakeTimers()

    const pending = createManager({ isProcessAlive: () => false }).resolveLaunchTarget()
    await vi.advanceTimersByTimeAsync(30_100)
    const recovered = await pending

    expect(recovered.runtimeImageKey).toBe(first.runtimeImageKey)
  })

  it('does not delete a successor publish lock when an old publisher closes late', async () => {
    let releaseArchiveCopy: (() => void) | undefined
    let markArchiveCopyStarted: (() => void) | undefined
    const archiveCopyStarted = new Promise<void>((resolve) => {
      markArchiveCopyStarted = resolve
    })
    const archiveCopyReleased = new Promise<void>((resolve) => {
      releaseArchiveCopy = resolve
    })
    const manager = createManager({
      archiveFileSystem: {
        access,
        readFile: (path) => readFile(path),
        stat,
        copyFile: async (sourcePath, destinationPath) => {
          markArchiveCopyStarted?.()
          await archiveCopyReleased
          await copyFile(sourcePath, destinationPath)
        }
      }
    })
    const pending = manager.resolveLaunchTarget()
    await archiveCopyStarted
    const lockEntry = (await readdir(runtimeRootDirectory)).find((entry) =>
      entry.endsWith('.publish-lock')
    )
    expect(lockEntry).toBeTruthy()
    const lockDirectory = join(runtimeRootDirectory, lockEntry!)
    await rm(lockDirectory, { force: true, recursive: true })
    await mkdir(lockDirectory)
    await writeFile(
      join(lockDirectory, 'owner.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        ownerId: 'successor-publisher',
        processId: process.pid,
        acquiredAt: new Date().toISOString()
      })}\n`,
      'utf8'
    )

    releaseArchiveCopy?.()
    await pending

    expect(existsSync(lockDirectory)).toBe(true)
  })

  it('quarantines and replaces an incomplete published image', async () => {
    const manager = createManager()
    const first = await manager.resolveLaunchTarget()
    await rm(join(runtimeRootDirectory, first.runtimeImageKey!, '.materialized.json'))

    const repaired = await manager.resolveLaunchTarget()

    expect(repaired).toEqual(first)
    expect(await readdir(runtimeRootDirectory)).toEqual([first.runtimeImageKey])
    expect(
      existsSync(join(runtimeRootDirectory, first.runtimeImageKey!, '.materialized.json'))
    ).toBe(true)
  })

  it('repairs a published image whose required ICU data is missing', async () => {
    const manager = createManager()
    const first = await manager.resolveLaunchTarget()
    const imageDirectory = join(runtimeRootDirectory, first.runtimeImageKey!)
    await Promise.all([
      rm(join(imageDirectory, 'icudtl.dat')),
      writeFile(join(imageDirectory, 'sentinel.txt'), 'invalid-image', 'utf8')
    ])

    const repaired = await manager.resolveLaunchTarget()

    expect(repaired).toEqual(first)
    expect(await readFile(join(imageDirectory, 'icudtl.dat'), 'utf8')).toBe('icu')
    expect(existsSync(join(imageDirectory, 'sentinel.txt'))).toBe(false)
  })

  it('repairs an image whose marker points at a different safe Provider entry', async () => {
    const manager = createManager()
    const first = await manager.resolveLaunchTarget()
    const markerPath = join(runtimeRootDirectory, first.runtimeImageKey!, '.materialized.json')
    const marker = JSON.parse(await readFile(markerPath, 'utf8')) as Record<string, unknown>
    await writeFile(
      markerPath,
      `${JSON.stringify({
        ...marker,
        providerEntryRelativePath: 'resources/app.asar/out/main/not-the-provider.js'
      })}\n`,
      'utf8'
    )

    const repaired = await manager.resolveLaunchTarget()

    expect(repaired.providerEntryPath).toBe(
      packagedProviderEntryPath(join(runtimeRootDirectory, repaired.runtimeImageKey!))
    )
    expect(JSON.parse(await readFile(markerPath, 'utf8'))).toMatchObject({
      providerEntryRelativePath: 'resources/app.asar/out/main/terminal-runtime-provider.js'
    })
  })

  it.each([
    ['cleancode-terminal-provider.exe'],
    ['resources', 'app.asar'],
    [
      'resources',
      'app.asar.unpacked',
      'node_modules',
      'node-pty',
      'build',
      'Release',
      'conpty_console_list.node'
    ],
    [
      'resources',
      'app.asar.unpacked',
      'node_modules',
      'node-pty',
      'build',
      'Release',
      'conpty',
      'conpty.dll'
    ]
  ])('repairs a published image whose copied closure file %s is invalid', async (...segments) => {
    const manager = createManager()
    const first = await manager.resolveLaunchTarget()
    const corruptedPath = join(runtimeRootDirectory, first.runtimeImageKey!, ...segments)
    await writeFile(corruptedPath, 'corrupted-runtime-file', 'utf8')

    const repaired = await manager.resolveLaunchTarget()

    expect(repaired).toEqual(first)
    expect(await readFile(corruptedPath, 'utf8')).not.toBe('corrupted-runtime-file')
  })

  it('never publishes a staging image that differs from its content key', async () => {
    const onFailure = vi.fn()
    const target = await createManager({
      archiveFileSystem: {
        access,
        readFile: (path) => readFile(path),
        stat,
        copyFile: async (sourcePath, destinationPath) => {
          await copyFile(sourcePath, destinationPath)
          await writeFile(destinationPath, 'changed-during-copy', 'utf8')
        }
      },
      onFailure
    }).resolveLaunchTarget()

    expect(target.runtimeImageKey).toBeUndefined()
    expect(onFailure).toHaveBeenCalledOnce()
    expect(
      (await readdir(runtimeRootDirectory).catch(() => [])).filter((entry) =>
        entry.includes('.staging-')
      )
    ).toEqual([])
  })

  it('fails open to the installed host and removes staging when a required file is missing', async () => {
    const onFailure = vi.fn()
    await rm(
      join(
        installDirectory,
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'node-pty',
        'build',
        'Release',
        'conpty.node'
      )
    )
    const manager = createManager({ onFailure })

    const target = await manager.resolveLaunchTarget()

    expect(target).toEqual({
      executablePath: join(installDirectory, 'CleanCode.exe'),
      providerEntryPath: packagedProviderEntryPath(installDirectory)
    })
    expect(onFailure).toHaveBeenCalledOnce()
    expect(await readdir(runtimeRootDirectory).catch(() => [])).toEqual([])
  })

  it('fails open when the Electron host ICU data is missing', async () => {
    const onFailure = vi.fn()
    await rm(join(installDirectory, 'icudtl.dat'))

    const target = await createManager({ onFailure }).resolveLaunchTarget()

    expect(target).toEqual({
      executablePath: join(installDirectory, 'CleanCode.exe'),
      providerEntryPath: packagedProviderEntryPath(installDirectory)
    })
    expect(onFailure).toHaveBeenCalledOnce()
    expect(await readdir(runtimeRootDirectory).catch(() => [])).toEqual([])
  })

  it.each([
    { isPackaged: false, platform: 'win32' as const },
    { isPackaged: true, platform: 'darwin' as const }
  ])('does not materialize for $platform when isPackaged=$isPackaged', async (override) => {
    const target = await createManager(override).resolveLaunchTarget()

    expect(target.runtimeImageKey).toBeUndefined()
    expect(target.executablePath).toBe(join(installDirectory, 'CleanCode.exe'))
    expect(existsSync(runtimeRootDirectory)).toBe(false)
  })

  it('changes the image key when the application archive or native binding changes', async () => {
    const first = await createManager().resolveLaunchTarget()
    await writeFile(
      join(installDirectory, 'resources', 'app.asar'),
      'application-archive-v2',
      'utf8'
    )

    const second = await createManager().resolveLaunchTarget()

    expect(second.runtimeImageKey).not.toBe(first.runtimeImageKey)
  })

  it('changes the image key when the signed Electron host changes', async () => {
    const first = await createManager().resolveLaunchTarget()
    await writeFile(join(installDirectory, 'CleanCode.exe'), 'electron-host-v2', 'utf8')

    const second = await createManager().resolveLaunchTarget()

    expect(second.runtimeImageKey).not.toBe(first.runtimeImageKey)
  })

  it('changes the image key when the post-pack ConPTY runtime changes', async () => {
    const first = await createManager().resolveLaunchTarget()
    await writeFile(
      join(
        installDirectory,
        'resources',
        'app.asar.unpacked',
        'node_modules',
        'node-pty',
        'build',
        'Release',
        'conpty',
        'conpty.dll'
      ),
      'conpty-v2',
      'utf8'
    )

    const second = await createManager().resolveLaunchTarget()

    expect(second.runtimeImageKey).not.toBe(first.runtimeImageKey)
  })

  it.each([
    ['pins a live legacy Provider', 42, true, 'pin'],
    ['does not pin a dead legacy Provider', 42, false, 'prune'],
    ['pins legacy provisional metadata', 0, false, 'pin']
  ] as const)('%s', async (_name, processId, processIsAlive, outcome) => {
    await expectPruneOutcome(
      { processId, runtimeImageKey: candidateImageKey },
      outcome,
      () => processIsAlive
    )
  })

  it('skips pruning when Provider metadata cannot be interpreted safely', async () => {
    await expectPruneOutcome('{incomplete', 'skip')
  })

  it('skips pruning when the legacy Provider liveness probe cannot produce a result', async () => {
    await expectPruneOutcome({ processId: 42, runtimeImageKey: candidateImageKey }, 'skip', () => {
      throw Object.assign(new Error('access denied'), { code: 'EACCES' })
    })
  })

  it('conservatively pins a legacy image when the process probe is access denied', async () => {
    vi.spyOn(process, 'kill').mockImplementation(() => {
      throw Object.assign(new Error('access denied'), { code: 'EPERM' })
    })

    await expectPruneOutcome({ processId: 42, runtimeImageKey: candidateImageKey }, 'pin')
  })

  it.each([
    ['fresh heartbeat', 0, 'pin'],
    ['stale heartbeat after PID reuse', terminalProviderHeartbeatStaleAfterMs + 1, 'prune']
  ] as const)(
    '%s determines whether its runtime image remains pinned',
    async (_name, age, outcome) => {
      const now = Date.now()
      vi.useFakeTimers()
      vi.setSystemTime(now)
      const metadata = createHeartbeatPinMetadata()
      const heartbeatPath = await createHeartbeatLease(metadata)
      const heartbeatTime = new Date(now - age)
      await utimes(heartbeatPath, heartbeatTime, heartbeatTime)

      await expectPruneOutcome(metadata, outcome, () => true)
    }
  )

  it.each(['malformed', 'identity mismatch', 'future mtime'] as const)(
    'skips the entire prune when the heartbeat has %s',
    async (fault) => {
      const now = Date.now()
      vi.useFakeTimers()
      vi.setSystemTime(now)
      const metadata = createHeartbeatPinMetadata()
      const heartbeatOwner =
        fault === 'identity mismatch' ? { ...metadata, instanceId: 'other-provider' } : metadata
      const heartbeatPath = await createHeartbeatLease(heartbeatOwner)
      if (fault === 'malformed') await writeFile(heartbeatPath, '{incomplete', 'utf8')
      if (fault === 'future mtime') {
        const future = new Date(now + terminalProviderHeartbeatIntervalMs * 2)
        await utimes(heartbeatPath, future, future)
      }

      await expectPruneOutcome(metadata, 'skip', () => true)
    }
  )

  it('pins new provisional metadata only during the startup grace period', async () => {
    const now = Date.now()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const processIsAlive = vi.fn(() => true)
    const metadata = createHeartbeatPinMetadata({ processId: 0 })

    await expectPruneOutcome(metadata, 'pin', processIsAlive)
    vi.setSystemTime(now + terminalProviderHeartbeatStaleAfterMs + 1)
    await expectPruneOutcome(metadata, 'prune', processIsAlive)
    expect(processIsAlive).not.toHaveBeenCalled()
  })

  it('never prunes active publish-lock coordination artifacts', async () => {
    const manager = createManager()
    const current = await manager.resolveLaunchTarget()
    const artifactNames = [
      `${current.runtimeImageKey}.publish-lock`,
      `${current.runtimeImageKey}.publish-lock.reclaim-guard`,
      `${current.runtimeImageKey}.publish-lock.reclaim-guard.candidate-owner`,
      `${current.runtimeImageKey}.publish-lock.reclaim-guard.reclaiming`,
      `${current.runtimeImageKey}.publish-lock.reclaim-guard.reclaimed-owner`
    ]
    await Promise.all(
      artifactNames.map((name) => mkdir(join(runtimeRootDirectory, name), { recursive: true }))
    )

    await manager.pruneUnusedImages()

    for (const name of artifactNames) {
      expect(existsSync(join(runtimeRootDirectory, name))).toBe(true)
    }
  })

  function createHeartbeatPinMetadata(
    overrides: Partial<HeartbeatPinMetadata> = {}
  ): HeartbeatPinMetadata {
    return {
      instanceId: 'provider-instance',
      processId: 42,
      startedAt: new Date().toISOString(),
      liveness: createTerminalProviderLivenessReference(),
      runtimeImageKey: candidateImageKey,
      ...overrides
    }
  }

  async function createHeartbeatLease(owner: HeartbeatPinMetadata): Promise<string> {
    const lease = await createTerminalProviderHeartbeat({
      stateDirectory: providerStateDirectory,
      owner,
      onFailure: vi.fn()
    })
    heartbeatLeases.push(lease)
    return getTerminalProviderHeartbeatPath(providerStateDirectory, owner.liveness)
  }

  async function expectPruneOutcome(
    metadata: unknown,
    outcome: 'pin' | 'prune' | 'skip',
    isProcessAlive?: (processId: number) => boolean
  ): Promise<void> {
    const manager = createManager(isProcessAlive ? { isProcessAlive } : {})
    const current = await manager.resolveLaunchTarget()
    await Promise.all([
      mkdir(join(runtimeRootDirectory, candidateImageKey), { recursive: true }),
      mkdir(join(runtimeRootDirectory, unusedImageKey), { recursive: true }),
      mkdir(runtimeImageRetirementMarker(candidateImageKey), { recursive: true }),
      mkdir(runtimeImageRetirementMarker(unusedImageKey), { recursive: true }),
      mkdir(providerStateDirectory, { recursive: true })
    ])
    const expiredAt = new Date(Date.now() - terminalProviderRetiredRuntimeImageRetentionMs - 1)
    await Promise.all([
      utimes(join(runtimeRootDirectory, candidateImageKey), expiredAt, expiredAt),
      utimes(join(runtimeRootDirectory, unusedImageKey), expiredAt, expiredAt),
      utimes(runtimeImageRetirementMarker(candidateImageKey), expiredAt, expiredAt),
      utimes(runtimeImageRetirementMarker(unusedImageKey), expiredAt, expiredAt)
    ])
    await writeFile(
      join(providerStateDirectory, 'provider.json'),
      typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
      'utf8'
    )

    await manager.pruneUnusedImages()

    expect(existsSync(join(runtimeRootDirectory, current.runtimeImageKey!))).toBe(true)
    expect(existsSync(join(runtimeRootDirectory, candidateImageKey))).toBe(outcome !== 'prune')
    expect(existsSync(join(runtimeRootDirectory, unusedImageKey))).toBe(outcome === 'skip')
  }

  function runtimeImageRetirementMarker(imageKey: string): string {
    return join(runtimeRootDirectory, '.retired-images+state', imageKey)
  }

  function createManager(
    overrides: Partial<TerminalProviderRuntimeImageOptions> = {}
  ): TerminalProviderRuntimeImageManager {
    return new TerminalProviderRuntimeImageManager({
      archiveFileSystem: {
        access,
        copyFile,
        readFile: (path) => readFile(path),
        stat
      },
      applicationVersion: '0.1.7',
      architecture: 'x64',
      electronVersion: '43.0.0',
      executablePath: join(installDirectory, 'CleanCode.exe'),
      isPackaged: true,
      platform: 'win32',
      providerEntryPath: packagedProviderEntryPath(installDirectory),
      providerStateDirectory,
      resourcesPath: join(installDirectory, 'resources'),
      runtimeRootDirectory,
      ...overrides
    })
  }
})

async function createPackagedWindowsFixture(installDirectory: string): Promise<void> {
  const resourcesDirectory = join(installDirectory, 'resources')
  const nodePtyDirectory = join(resourcesDirectory, 'app.asar.unpacked', 'node_modules', 'node-pty')
  const releaseDirectory = join(nodePtyDirectory, 'build', 'Release')
  await Promise.all([
    mkdir(resourcesDirectory, { recursive: true }),
    mkdir(join(releaseDirectory, 'conpty'), { recursive: true }),
    mkdir(join(nodePtyDirectory, 'lib'), { recursive: true })
  ])
  await Promise.all([
    writeFile(join(installDirectory, 'CleanCode.exe'), 'electron-host', 'utf8'),
    writeFile(join(installDirectory, 'icudtl.dat'), 'icu', 'utf8'),
    writeFile(join(installDirectory, 'snapshot_blob.bin'), 'snapshot', 'utf8'),
    writeFile(join(installDirectory, 'v8_context_snapshot.bin'), 'v8-snapshot', 'utf8'),
    writeFile(join(installDirectory, 'ffmpeg.dll'), 'not-needed', 'utf8'),
    writeFile(join(resourcesDirectory, 'app.asar'), 'application-archive-v1', 'utf8'),
    writeFile(join(releaseDirectory, 'conpty.node'), 'native-binding', 'utf8'),
    writeFile(join(releaseDirectory, 'conpty_console_list.node'), 'console-list-binding', 'utf8'),
    writeFile(join(releaseDirectory, 'pty.node'), 'winpty-binding', 'utf8'),
    writeFile(join(releaseDirectory, 'conpty.pdb'), 'debug-symbols', 'utf8'),
    writeFile(join(releaseDirectory, 'conpty', 'conpty.dll'), 'conpty', 'utf8'),
    writeFile(join(releaseDirectory, 'conpty', 'OpenConsole.exe'), 'console', 'utf8'),
    writeFile(join(nodePtyDirectory, 'lib', 'windowsTerminal.js'), 'module.exports = {}', 'utf8')
  ])
}

function packagedProviderEntryPath(installDirectory: string): string {
  return join(
    installDirectory,
    'resources',
    'app.asar',
    'out',
    'main',
    'terminal-runtime-provider.js'
  )
}
