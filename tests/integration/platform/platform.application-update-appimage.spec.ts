import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import childProcess from 'node:child_process'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type * as ElectronUpdater from 'electron-updater'
import { createApplicationUpdateService } from '../../../src/platform/electron-main/applicationUpdateService'
import { bindApplicationQuitLifecycle } from '../../../src/platform/electron-main/applicationQuitLifecycle'
import { createApplicationUpdateRestart } from '../../../src/platform/electron-main/applicationUpdateRestart'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof fsPromises>()
  return {
    ...actual,
    link: vi.fn(actual.link),
    copyFile: vi.fn(actual.copyFile),
    rename: vi.fn(actual.rename)
  }
})

const require = createRequire(import.meta.url)
const { AppImageUpdater } = require('electron-updater') as typeof ElectronUpdater

describe('AppImage replacement recovery', () => {
  it.each([
    { name: 'CleanCode-0.1.0.AppImage', partialCopy: false, restoreDenied: false },
    { name: 'CleanCode.AppImage', partialCopy: true, restoreDenied: false },
    { name: 'CleanCode-0.1.0.AppImage', partialCopy: false, restoreDenied: true }
  ])('restarts a complete executable after replacement fails: %j', async (scenario) => {
    const directory = fs.mkdtempSync(join(tmpdir(), 'cleancode-appimage-recovery-'))
    const currentAppImage = join(directory, scenario.name)
    const installer = join(directory, 'CleanCode-0.2.0.AppImage')
    const destination = scenario.partialCopy ? currentAppImage : installer
    fs.writeFileSync(currentAppImage, 'old executable', { mode: 0o755 })
    fs.writeFileSync(installer, 'verified new executable', { mode: 0o755 })
    vi.stubEnv('APPIMAGE', currentAppImage)
    let windowOpen = true
    let relaunchedBytes: string | undefined
    const application = Object.assign(new EventEmitter(), {
      quit: vi.fn(() => {
        const event = { preventDefault: vi.fn() }
        application.emit('before-quit', event)
        if (event.preventDefault.mock.calls.length === 0) windowOpen = false
      }),
      relaunch: vi.fn((options?: { execPath: string }) => {
        relaunchedBytes = fs.readFileSync(options!.execPath, 'utf8')
        if (process.platform !== 'win32') fs.accessSync(options!.execPath, fs.constants.X_OK)
      })
    })
    const lifecycle = bindApplicationQuitLifecycle({
      app: application,
      relaunchExecutable: currentAppImage,
      shutdown: async () => undefined
    })
    const updater = new AppImageUpdater(undefined, {
      version: '0.1.0',
      name: 'CleanCode',
      isPackaged: true,
      appUpdateConfigPath: join(directory, 'unused.yml'),
      userDataPath: directory,
      baseCachePath: directory,
      whenReady: async () => undefined,
      relaunch: application.relaunch,
      quit: application.quit,
      onQuit: () => undefined
    })
    updater.logger = null
    updater.autoInstallOnAppQuit = false
    Object.assign(updater, {
      downloadedUpdateHelper: { file: installer, downloadedFileInfo: {} }
    })
    const release = {
      version: '0.2.0',
      files: [{ url: 'CleanCode-0.2.0.AppImage', sha512: 'fixture-checksum' }],
      path: 'CleanCode-0.2.0.AppImage',
      sha512: 'fixture-checksum',
      releaseDate: '2026-01-01T00:00:00.000Z'
    }
    vi.spyOn(updater, 'checkForUpdates').mockImplementation(async () => {
      updater.emit('update-available', release)
      return null
    })
    vi.spyOn(updater, 'downloadUpdate').mockResolvedValue([installer])
    const move = vi.spyOn(childProcess, 'execFileSync').mockImplementation(() => {
      expect(fs.existsSync(currentAppImage)).toBe(false)
      if (scenario.partialCopy) fs.writeFileSync(destination, 'partial new executable')
      throw Object.assign(new Error('destination filesystem is full'), { code: 'ENOSPC' })
    })
    const rename = scenario.restoreDenied
      ? vi.spyOn(fsPromises, 'rename').mockRejectedValue(new Error('directory became read-only'))
      : undefined
    const restart = createApplicationUpdateRestart({
      prepareRestart: lifecycle.prepareUpdate,
      restartAfterFailedInstall: lifecycle.recoverFailedUpdate,
      appImagePath: currentAppImage,
      isInstallFailed: () => service.getSnapshot().error === 'install',
      onCleanupFailure: vi.fn()
    })
    application.on('before-quit', restart.beforeQuit)
    const service = createApplicationUpdateService({ updater, ...restart })
    try {
      await service.check()
      updater.emit('update-downloaded', { ...release, downloadedFile: installer })
      await service.install('0.2.0')
      await vi.waitFor(() => expect(application.relaunch).toHaveBeenCalledOnce())
      expect(relaunchedBytes).toBe('old executable')
      const executable = application.relaunch.mock.calls[0][0]!.execPath
      if (scenario.restoreDenied) expect(executable).not.toBe(currentAppImage)
      else expect(executable).toBe(currentAppImage)
      expect(fs.readFileSync(executable, 'utf8')).toBe('old executable')
      expect(windowOpen).toBe(false)
      expect(service.getSnapshot()).toMatchObject({ status: 'error', error: 'install' })
      expect(move).toHaveBeenCalledExactlyOnceWith('mv', ['-f', installer, destination])
      if (!scenario.restoreDenied) {
        expect(
          fs.readdirSync(directory).some((name) => name.startsWith('.cleancode-update-'))
        ).toBe(false)
      }
    } finally {
      service.dispose()
      move.mockRestore()
      rename?.mockRestore()
      vi.unstubAllEnvs()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  // File symlinks on Windows require privileges unrelated to Linux AppImage recovery.
  it.each(['hard-link', 'copy', ...(process.platform === 'win32' ? [] : ['symlink'])])(
    'retains the old executable until successful installation quits (%s)',
    async (backupKind) => {
      const directory = fs.mkdtempSync(join(tmpdir(), 'cleancode-appimage-backup-'))
      const currentAppImage = join(directory, 'CleanCode.AppImage')
      const target = join(directory, 'original.AppImage')
      fs.writeFileSync(target, 'old executable', { mode: 0o755 })
      if (backupKind === 'symlink') fs.symlinkSync('original.AppImage', currentAppImage)
      else fs.renameSync(target, currentAppImage)
      const link =
        backupKind === 'copy'
          ? vi.spyOn(fsPromises, 'link').mockRejectedValue(new Error('hard links unsupported'))
          : undefined
      const cleanupFailure = vi.fn()
      const restart = createApplicationUpdateRestart({
        appImagePath: currentAppImage,
        prepareRestart: async () => undefined,
        restartAfterFailedInstall: async () => undefined,
        isInstallFailed: () => false,
        onCleanupFailure: cleanupFailure
      })
      try {
        await restart.prepareRestart()
        const backupDirectory = fs
          .readdirSync(directory)
          .find((name) => name.startsWith('.cleancode-'))!
        const backup = join(directory, backupDirectory, 'CleanCode.AppImage')
        fs.unlinkSync(currentAppImage)
        expect(fs.readFileSync(backup, 'utf8')).toBe('old executable')
        if (process.platform !== 'win32') fs.accessSync(backup, fs.constants.X_OK)
        fs.writeFileSync(currentAppImage, 'new executable', { mode: 0o755 })
        const quit = { preventDefault: vi.fn() }
        restart.beforeQuit(quit)
        expect(quit.preventDefault).not.toHaveBeenCalled()
        expect(fs.existsSync(backup)).toBe(false)
        expect(fs.readFileSync(currentAppImage, 'utf8')).toBe('new executable')
        expect(cleanupFailure).not.toHaveBeenCalled()
      } finally {
        link?.mockRestore()
        fs.rmSync(directory, { recursive: true, force: true })
      }
    }
  )

  it('keeps the original install when no complete backup can be created', async () => {
    const directory = fs.mkdtempSync(join(tmpdir(), 'cleancode-appimage-full-'))
    const currentAppImage = join(directory, 'CleanCode.AppImage')
    fs.writeFileSync(currentAppImage, 'old executable', { mode: 0o755 })
    const link = vi.spyOn(fsPromises, 'link').mockRejectedValue(new Error('hard links unsupported'))
    const copy = vi.spyOn(fsPromises, 'copyFile').mockRejectedValue(new Error('filesystem full'))
    const recover = vi.fn(async () => undefined)
    const restart = createApplicationUpdateRestart({
      appImagePath: currentAppImage,
      prepareRestart: async () => undefined,
      restartAfterFailedInstall: recover,
      isInstallFailed: () => true,
      onCleanupFailure: vi.fn()
    })
    try {
      await expect(restart.prepareRestart()).rejects.toThrow('filesystem full')
      await restart.restartAfterFailedInstall()
      expect(recover).toHaveBeenCalledExactlyOnceWith(currentAppImage)
      expect(fs.readFileSync(currentAppImage, 'utf8')).toBe('old executable')
      expect(fs.readdirSync(directory)).toEqual(['CleanCode.AppImage'])
    } finally {
      link.mockRestore()
      copy.mockRestore()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('blocks quit until a pending backup and its recovery finish', async () => {
    const directory = fs.mkdtempSync(join(tmpdir(), 'cleancode-appimage-race-'))
    const currentAppImage = join(directory, 'CleanCode.AppImage')
    fs.writeFileSync(currentAppImage, 'old executable', { mode: 0o755 })
    let finish: () => void = () => undefined
    const shutdown = new Promise<void>((resolve) => {
      finish = resolve
    })
    const recover = vi.fn(async (executable?: string) => {
      expect(fs.readFileSync(executable!, 'utf8')).toBe('old executable')
      const quit = { preventDefault: vi.fn() }
      restart.beforeQuit(quit)
      expect(quit.preventDefault).not.toHaveBeenCalled()
    })
    const restart = createApplicationUpdateRestart({
      appImagePath: currentAppImage,
      prepareRestart: () => shutdown,
      restartAfterFailedInstall: recover,
      isInstallFailed: () => true,
      onCleanupFailure: vi.fn()
    })
    try {
      const preparing = restart.prepareRestart()
      const quit = { preventDefault: vi.fn() }
      restart.beforeQuit(quit)
      const recovering = restart.restartAfterFailedInstall()
      restart.beforeQuit(quit)
      expect(quit.preventDefault).toHaveBeenCalledTimes(2)
      expect(recover).not.toHaveBeenCalled()
      finish()
      await Promise.all([preparing, recovering, restart.restartAfterFailedInstall()])
      expect(recover).toHaveBeenCalledExactlyOnceWith(currentAppImage)
      expect(fs.readdirSync(directory)).toEqual(['CleanCode.AppImage'])
    } finally {
      finish()
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })
})
