import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import electronUpdater from 'electron-updater'
import { applicationUpdateChannels } from '../ipc/applicationUpdateChannels'
import { consoleLogger } from '../logging/ConsoleLogSink'
import { createApplicationUpdateService } from './applicationUpdateService'
import {
  readMacApplicationSignature,
  resolveApplicationUpdateAvailability
} from './applicationUpdateAvailability'
import { registerApplicationUpdateIpc } from './applicationUpdateIpc'

export async function configureApplicationUpdates(input: {
  readonly prepareRestart: () => Promise<void>
  readonly restartAfterFailedInstall: () => Promise<void>
}): Promise<void> {
  const updater = electronUpdater.autoUpdater
  // Install exclusively after a user confirms the exact verified release.
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.autoRunAppAfterInstall = true
  updater.allowPrerelease = true
  updater.allowDowngrade = false
  updater.disableWebInstaller = true
  updater.logger = null
  const unavailableReason = resolveApplicationUpdateAvailability({
    isPackaged: app.isPackaged,
    platform: process.platform,
    isAppImage: Boolean(process.env.APPIMAGE),
    macSignature:
      app.isPackaged && process.platform === 'darwin'
        ? await readMacApplicationSignature(app.getPath('exe'))
        : undefined
  })
  const service = createApplicationUpdateService({
    updater,
    unavailableReason,
    prepareRestart: input.prepareRestart,
    restartAfterFailedInstall: input.restartAfterFailedInstall,
    onFailure: (stage) =>
      consoleLogger.warn({
        scope: 'platform.application-update',
        operation: stage,
        outcome: 'failure',
        error: {
          code: 'UNEXPECTED_ERROR',
          isExpected: true,
          message: `Application update ${stage} failed.`
        }
      })
  })
  registerApplicationUpdateIpc({
    ipcMain,
    service,
    logger: consoleLogger,
    isTrustedSender: (event) => {
      const { sender, senderFrame } = event as IpcMainInvokeEvent
      return (
        !sender.isDestroyed() &&
        senderFrame === sender.mainFrame &&
        BrowserWindow.fromWebContents(sender) !== null
      )
    }
  })
  const unsubscribe = service.subscribe((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send(applicationUpdateChannels.changed, snapshot)
      }
    }
  })
  const interval = unavailableReason
    ? undefined
    : setInterval(
        () => {
          void service.check()
        },
        4 * 60 * 60 * 1000
      )
  interval?.unref()
  app.once('will-quit', () => {
    if (interval) clearInterval(interval)
    unsubscribe()
    service.dispose()
  })
  if (!unavailableReason) void service.check()
}
