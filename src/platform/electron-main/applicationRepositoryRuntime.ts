import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'

import { consoleLogger } from '../logging/ConsoleLogSink'
import { createApplicationRepositoryStarsReader } from './applicationRepositoryStars'
import { registerApplicationRepositoryStarsIpc } from './applicationRepositoryStarsIpc'

export function configureApplicationRepository(): void {
  registerApplicationRepositoryStarsIpc({
    ipcMain,
    isTrustedSender: (event) => {
      const { sender, senderFrame } = event as IpcMainInvokeEvent
      return (
        !sender.isDestroyed() &&
        senderFrame === sender.mainFrame &&
        BrowserWindow.fromWebContents(sender) !== null
      )
    },
    logger: consoleLogger,
    read: createApplicationRepositoryStarsReader()
  })
}
