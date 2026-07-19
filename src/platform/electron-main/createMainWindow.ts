import { BrowserWindow } from 'electron'
import { join } from 'node:path'

import type { ElectronWindowPolicy } from './electronWindowPolicy'
import { resolveWindowFrameOptions } from './windowFrameOptions'
import { bindWindowFullScreenState } from './windowFullScreenState'

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
      preload: join(__dirname, '../preload/preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  bindWindowFullScreenState(mainWindow)

  if (input.policy.mode === 'offscreen-inactive') {
    const { position } = input.policy
    mainWindow.once('ready-to-show', () => {
      if (mainWindow.isDestroyed()) return

      mainWindow.setPosition(position.x, position.y, false)
      mainWindow.showInactive()
    })
  }

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    return
  }

  void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}
