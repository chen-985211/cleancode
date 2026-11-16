import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import type * as ElectronUpdater from 'electron-updater'
import { createApplicationUpdateService } from '../../../src/platform/electron-main/applicationUpdateService'
import { bindApplicationQuitLifecycle } from '../../../src/platform/electron-main/applicationQuitLifecycle'

const require = createRequire(import.meta.url)
const { AppImageUpdater } = require('electron-updater') as typeof ElectronUpdater

describe('application recovery after a real AppImageUpdater install error', () => {
  it('relaunches the current AppImage and closes the disposed window after EACCES', async () => {
    const currentAppImage = '/opt/cleancode/CleanCode-0.1.0.AppImage'
    const installer = '/cache/cleancode/CleanCode-0.2.0.AppImage'
    const release = {
      version: '0.2.0',
      files: [{ url: 'CleanCode-0.2.0.AppImage', sha512: 'fixture-checksum' }],
      path: 'CleanCode-0.2.0.AppImage',
      sha512: 'fixture-checksum',
      releaseDate: '2026-01-01T00:00:00.000Z'
    }
    vi.stubEnv('APPIMAGE', currentAppImage)
    const order: string[] = []
    let windowOpen = true
    const application = Object.assign(new EventEmitter(), {
      quit: vi.fn(() => {
        const event = { preventDefault: vi.fn() }
        application.emit('before-quit', event)
        if (event.preventDefault.mock.calls.length === 0) {
          windowOpen = false
          order.push('quit')
        }
      }),
      relaunch: vi.fn(() => {
        order.push('relaunch')
      })
    })
    const lifecycle = bindApplicationQuitLifecycle({
      app: application,
      relaunchExecutable: currentAppImage,
      shutdown: async () => {
        order.push('shutdown')
      }
    })
    const updater = new AppImageUpdater(undefined, {
      version: '0.1.0',
      name: 'CleanCode',
      isPackaged: true,
      appUpdateConfigPath: '/unused/app-update.yml',
      userDataPath: '/unused/state',
      baseCachePath: '/unused/cache',
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
    vi.spyOn(updater, 'checkForUpdates').mockImplementation(async () => {
      updater.emit('update-available', release)
      return null
    })
    vi.spyOn(updater, 'downloadUpdate').mockResolvedValue([installer])
    const failure = Object.assign(new Error('AppImage directory is read-only'), { code: 'EACCES' })
    // Exercise the real updater's catch-and-emit path without touching an application file.
    const unlink = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw failure
    })
    const errors: Error[] = []
    updater.on('error', (error) => {
      errors.push(error)
    })
    const service = createApplicationUpdateService({
      updater,
      prepareRestart: lifecycle.prepareUpdate,
      restartAfterFailedInstall: lifecycle.recoverFailedUpdate
    })
    try {
      await service.check()
      updater.emit('update-downloaded', { ...release, downloadedFile: installer })
      await service.install('0.2.0')
      await vi.waitFor(() => expect(windowOpen).toBe(false))
      expect(unlink).toHaveBeenCalledExactlyOnceWith(currentAppImage)
      expect(errors).toEqual([failure])
      expect(service.getSnapshot()).toMatchObject({ status: 'error', error: 'install' })
      expect(order).toEqual(['shutdown', 'relaunch', 'quit'])
      expect(application.relaunch).toHaveBeenCalledExactlyOnceWith({ execPath: currentAppImage })
      expect(application.quit).toHaveBeenCalledOnce()
    } finally {
      service.dispose()
      unlink.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
