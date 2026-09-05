import { app, BrowserWindow, screen, shell } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { consoleLogger } from '../logging/ConsoleLogSink'
import { FileSystemMainWindowStateStore } from './FileSystemMainWindowStateStore'
import { bindElectronExternalNavigationPolicy } from './electronExternalNavigationPolicy'
import type { ElectronWindowPolicy } from './electronWindowPolicy'
import { bindElectronPageZoomStartup } from './electronPageZoomPolicy'
import {
  bindApplicationQuitConfirmationToWindow,
  type ApplicationQuitConfirmationCoordinator
} from './applicationQuitConfirmation'
import { bindMainWindowStatePersistence } from './mainWindowStateLifecycle'
import {
  mainWindowMinimumSize,
  mainWindowStateSchemaVersion,
  resolveMainWindowFullScreenOptions,
  resolveMainWindowStartupState
} from './mainWindowStatePolicy'
import { resolveWindowFrameOptions, shouldRemoveDefaultWindowMenu } from './windowFrameOptions'
import { bindWindowFullScreenState } from './windowFullScreenState'

const mainModuleDirectory = dirname(fileURLToPath(import.meta.url))

export function createMainWindow(input: {
  readonly applicationQuitConfirmation: ApplicationQuitConfirmationCoordinator
  readonly appIconPath: string | undefined
  readonly policy: ElectronWindowPolicy
}): void {
  const windowStateStore = new FileSystemMainWindowStateStore({
    filePath: join(app.getPath('userData'), 'window-state-v1.json'),
    logger: consoleLogger
  })
  const primaryDisplayId = screen.getPrimaryDisplay().id
  const startupState = resolveMainWindowStartupState({
    displays: screen.getAllDisplays().map((display) => ({
      isPrimary: display.id === primaryDisplayId,
      workArea: display.workArea
    })),
    persistedState: windowStateStore.load(),
    policy:
      input.policy.mode === 'normal'
        ? { mode: 'normal' }
        : { mode: 'offscreen-inactive', position: input.policy.position }
  })
  const mainWindow = new BrowserWindow({
    ...startupState.normalBounds,
    minWidth: mainWindowMinimumSize.width,
    minHeight: mainWindowMinimumSize.height,
    ...resolveMainWindowFullScreenOptions(startupState.displayMode),
    title: 'cleancode',
    backgroundColor: '#f7f8fa',
    icon: input.appIconPath,
    show: input.policy.show,
    ...(input.policy.mode === 'offscreen-inactive'
      ? {
          enableLargerThanScreen: input.policy.enableLargerThanScreen
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
  const windowStateBinding = bindMainWindowStatePersistence({
    initialState: {
      version: mainWindowStateSchemaVersion,
      ...startupState
    },
    persistDisplayMode: input.policy.mode === 'normal',
    store: windowStateStore,
    target: mainWindow
  })
  if (shouldRemoveDefaultWindowMenu(process.platform)) mainWindow.removeMenu()
  bindWindowFullScreenState(mainWindow)
  bindApplicationQuitConfirmationToWindow({
    coordinator: input.applicationQuitConfirmation,
    platform: process.platform,
    target: mainWindow
  })
  bindElectronPageZoomStartup(mainWindow.webContents)
  bindElectronExternalNavigationPolicy({
    onOpenError: logExternalNavigationError,
    openExternal: (address) => shell.openExternal(address),
    webContents: mainWindow.webContents
  })

  if (startupState.displayMode === 'maximized') mainWindow.maximize()

  mainWindow.once('ready-to-show', () => {
    if (mainWindow.isDestroyed()) return

    if (input.policy.mode === 'offscreen-inactive') {
      const { position } = input.policy
      mainWindow.setPosition(position.x, position.y, false)
      mainWindow.showInactive()
      return
    }

    // Do not expose an uninitialised renderer surface. On Windows the native
    // window can otherwise present a stale/black compositor tile for one or
    // more frames while React Flow restores the persisted canvas viewport.
    mainWindow.show()
  })

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
    windowStateBinding.flush()
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
