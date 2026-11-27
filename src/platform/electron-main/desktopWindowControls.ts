import {
  desktopWindowChannels,
  type DesktopWindowAction,
  type SnapButtonBounds
} from '../ipc/desktopWindowControls'
import { registerIpcHandler, type IpcMainLike } from '../ipc/registerIpcHandler'
import type { Logger } from '../logging/Logger'
import {
  bindWindowFullScreenState,
  registerWindowFullScreenStateIpc
} from './windowFullScreenState'
import { setWindowsSnapButtonBounds } from './windowsSnapLayout'
import type { BrowserWindow } from 'electron'

type ControlsTarget = Pick<
  BrowserWindow,
  | 'close'
  | 'minimize'
  | 'maximize'
  | 'unmaximize'
  | 'isMaximized'
  | 'isFullScreen'
  | 'isDestroyed'
  | 'getNativeWindowHandle'
>
type StateTarget = Parameters<typeof bindWindowFullScreenState>[0]

export function bindDesktopWindowState(target: StateTarget): void {
  bindWindowFullScreenState(target)
  const publish = (maximized: boolean): void => {
    if (!target.isDestroyed() && !target.webContents.isDestroyed()) {
      target.webContents.send(desktopWindowChannels.maximizedChanged, maximized)
    }
  }
  const onMaximize = () => publish(true)
  const onUnmaximize = () => publish(false)
  const dispose = (): void => {
    target.removeListener('maximize', onMaximize)
    target.removeListener('unmaximize', onUnmaximize)
    target.removeListener('closed', dispose)
  }
  target.on('maximize', onMaximize)
  target.on('unmaximize', onUnmaximize)
  target.on('closed', dispose)
}

export function registerDesktopWindowIpc(input: {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly resolveWindow: (event: unknown) => ControlsTarget | null
}): void {
  registerWindowFullScreenStateIpc(input)
  const boundary = { ipcMain: input.ipcMain, logger: input.logger, scope: 'platform.window' }
  registerIpcHandler<undefined, boolean>({
    ...boundary,
    channel: desktopWindowChannels.isMaximized,
    operation: 'isWindowMaximized',
    handler: (_command, event) => input.resolveWindow(event)?.isMaximized() ?? false
  })
  registerIpcHandler<DesktopWindowAction, void>({
    ...boundary,
    channel: desktopWindowChannels.perform,
    operation: 'performDesktopWindowAction',
    handler: (action, event) => {
      const window = input.resolveWindow(event)
      if (!window || window.isDestroyed()) return
      switch (action) {
        case 'close':
          return window.close()
        case 'minimize':
          return window.minimize()
        case 'toggle-maximize':
          return window.isMaximized() ? window.unmaximize() : window.maximize()
        default:
          throw new Error('Unrecognized desktop window action.')
      }
    }
  })
  registerIpcHandler<SnapButtonBounds | null, void>({
    ...boundary,
    channel: desktopWindowChannels.setSnapBounds,
    operation: 'setWindowSnapButtonBounds',
    successLogLevel: 'silent',
    handler: (bounds, event) => {
      const window = input.resolveWindow(event)
      if (window && !window.isDestroyed()) setWindowsSnapButtonBounds(window, bounds)
    }
  })
}
