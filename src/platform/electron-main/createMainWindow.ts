import { BrowserWindow, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { consoleLogger } from '../logging/ConsoleLogSink'
import { bindElectronExternalNavigationPolicy } from './electronExternalNavigationPolicy'
import type { ElectronWindowPolicy } from './electronWindowPolicy'
import { bindElectronPageZoomStartup } from './electronPageZoomPolicy'
import { resolveWindowFrameOptions, shouldRemoveDefaultWindowMenu } from './windowFrameOptions'
import { bindWindowFullScreenState } from './windowFullScreenState'

const mainModuleDirectory = dirname(fileURLToPath(import.meta.url))

export function createMainWindow(input: {
  readonly appIconPath: string | undefined
  readonly policy: ElectronWindowPolicy
}): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: 'cleancode',
    backgroundColor: '#f7f8fa',
    icon: input.appIconPath,
    show: input.policy.show,
    ...(input.policy.mode === 'offscreen-inactive'
      ? {
          enableLargerThanScreen: input.policy.enableLargerThanScreen,
          ...input.policy.position
        }
      : {}),
    ...resolveWindowFrameOptions(process.platform),
    webPreferences: {
      backgroundThrottling: input.policy.backgroundThrottling,
      preload: join(mainModuleDirectory, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  if (shouldRemoveDefaultWindowMenu(process.platform)) mainWindow.removeMenu()
  bindWindowFullScreenState(mainWindow)
  bindElectronPageZoomStartup(mainWindow.webContents)
  bindElectronExternalNavigationPolicy({
    onOpenError: logExternalNavigationError,
    openExternal: (address) => shell.openExternal(address),
    webContents: mainWindow.webContents
  })

  if (input.policy.mode === 'offscreen-inactive') {
    const { position } = input.policy
    mainWindow.once('ready-to-show', () => {
      if (mainWindow.isDestroyed()) return

      mainWindow.setPosition(position.x, position.y, false)
      mainWindow.showInactive()
    })
  }

  const loadRenderer = () => {
    if (mainWindow.isDestroyed()) return
    if (process.env.ELECTRON_RENDERER_URL) {
      void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
      return
    }
    void mainWindow.loadFile(join(mainModuleDirectory, '../renderer/index.html'))
  }
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || mainWindow.isDestroyed()) return
    createMainWindow(input)
    mainWindow.destroy()
  })
  loadRenderer()
}

function logExternalNavigationError(): void {
  consoleLogger.warn({
    scope: 'platform.window',
    operation: 'openExternalNavigation',
    outcome: 'failure',
    error: { message: 'The system external-navigation request failed.' }
  })
}
