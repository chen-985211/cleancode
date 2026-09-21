import { access, copyFile, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  TerminalProviderRuntimeImageManager,
  type TerminalProviderRuntimeImageOptions
} from '../../../src/platform/electron-main/terminalProviderRuntimeImage'
import { acquireRuntimeImagePublishLock } from '../../../src/platform/electron-main/TerminalProviderRuntimeImagePublishLock'
import {
  createPackagedWindowsRuntimeFixture,
  packagedTerminalProviderEntryPath
} from '../../support/terminalProviderRuntimeImageFixture'

describe('TerminalProviderRuntimeImageManager publish retry', () => {
  let temporaryDirectory = ''
  let installDirectory = ''
  let runtimeRootDirectory = ''
  let providerStateDirectory = ''

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'cc-provider-runtime-retry-'))
    installDirectory = join(temporaryDirectory, 'installed-app')
    runtimeRootDirectory = join(temporaryDirectory, 'runtime-images')
    providerStateDirectory = join(temporaryDirectory, 'provider-state')
    await createPackagedWindowsRuntimeFixture(installDirectory)
  })

  afterEach(async () => {
    await rm(temporaryDirectory, { force: true, recursive: true })
  })

  it('retries a transient publish-lock acquisition failure and converges with a concurrent publisher', async () => {
    const transientFailure = Object.assign(new Error('publish lock is temporarily busy'), {
      code: 'EPERM'
    })
    const onFailure = vi.fn()
    const acquirePublishLock = vi
      .fn<typeof acquireRuntimeImagePublishLock>()
      .mockRejectedValueOnce(transientFailure)
      .mockImplementation(acquireRuntimeImagePublishLock)
    const recoveringManager = createManager({ acquirePublishLock, onFailure })

    const [recovered, published] = await Promise.all([
      recoveringManager.resolveLaunchTarget(),
      createManager().resolveLaunchTarget()
    ])

    expect(recovered).toEqual(published)
    expect(recovered.runtimeImageKey).toMatch(/^0\.1\.7-[a-f0-9]{16}$/)
    expect(acquirePublishLock).toHaveBeenCalledTimes(2)
    expect(onFailure).toHaveBeenCalledOnce()
    expect(onFailure).toHaveBeenCalledWith(transientFailure)
    expect(await readdir(runtimeRootDirectory)).toEqual([recovered.runtimeImageKey])
  })

  it('falls back after one retry when publish-lock acquisition remains transiently unavailable', async () => {
    const transientFailure = Object.assign(new Error('publish lock remains temporarily busy'), {
      code: 'EBUSY'
    })
    const onFailure = vi.fn()
    const acquirePublishLock = vi
      .fn<typeof acquireRuntimeImagePublishLock>()
      .mockRejectedValue(transientFailure)

    const target = await createManager({ acquirePublishLock, onFailure }).resolveLaunchTarget()

    expect(target).toEqual({
      executablePath: join(installDirectory, 'CleanCode.exe'),
      providerEntryPath: packagedTerminalProviderEntryPath(installDirectory)
    })
    expect(acquirePublishLock).toHaveBeenCalledTimes(2)
    expect(onFailure).toHaveBeenCalledTimes(2)
    expect(await readdir(runtimeRootDirectory)).toEqual([])
  })

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
      providerEntryPath: packagedTerminalProviderEntryPath(installDirectory),
      providerStateDirectory,
      resourcesPath: join(installDirectory, 'resources'),
      runtimeRootDirectory,
      ...overrides
    })
  }
})
