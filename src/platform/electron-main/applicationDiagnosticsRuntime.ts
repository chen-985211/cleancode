import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { homedir, release } from 'node:os'

import { consoleLogger } from '../logging/ConsoleLogSink'
import {
  collectApplicationDiagnostics,
  writeApplicationDiagnosticsFile
} from './applicationDiagnostics'
import { registerApplicationDiagnosticsIpc } from './applicationDiagnosticsIpc'

export function configureApplicationDiagnostics(
  appStateDirectory: string,
  providerStateDirectory: string
): void {
  registerApplicationDiagnosticsIpc({
    collect: (generatedAt) =>
      collectApplicationDiagnostics({
        application: {
          isPackaged: app.isPackaged,
          name: app.getName(),
          version: app.getVersion()
        },
        appStateDirectory,
        generatedAt,
        homeDirectory: homedir(),
        providerStateDirectory,
        runtime: {
          architecture: process.arch,
          chromiumVersion: process.versions.chrome ?? 'unknown',
          electronVersion: process.versions.electron ?? 'unknown',
          nodeVersion: process.versions.node,
          osRelease: release(),
          platform: process.platform
        }
      }),
    defaultDirectory: app.getPath('downloads'),
    ipcMain,
    logger: consoleLogger,
    resolveTarget: (event) => BrowserWindow.fromWebContents((event as IpcMainInvokeEvent).sender),
    showSaveDialog: (target, options) => dialog.showSaveDialog(target as BrowserWindow, options),
    write: writeApplicationDiagnosticsFile
  })
}
