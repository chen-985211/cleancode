import {
  desktopWindowChannels,
  type DesktopWindowAction,
  type DesktopWindowState,
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
  | 'isFocused'
  | 'isMaximized'
  | 'isFullScreen'
  | 'isDestroyed'
  | 'getNativeWindowHandle'
>
type WindowFlags = Pick<BrowserWindow, 'isFocused' | 'isMaximized'>
type StateTarget = Parameters<typeof bindWindowFullScreenState>[0] & WindowFlags

function readState(window: WindowFlags | null): DesktopWindowState {
  return { focused: window?.isFocused() ?? false, maximized: window?.isMaximized() ?? false }
}

export function bindDesktopWindowState(target: StateTarget): void {
  bindWindowFullScreenState(target)
  const events = ['focus', 'blur', 'maximize', 'unmaximize']
  const publish = (): void => {
    if (!target.isDestroyed() && !target.webContents.isDestroyed()) {
      target.webContents.send(desktopWindowChannels.stateChanged, readState(target))
    }
  }
  const dispose = (): void => {
    for (const event of events) target.removeListener(event, publish)
    target.removeListener('closed', dispose)
  }
  for (const event of events) target.on(event, publish)
  target.on('closed', dispose)
}

export function registerDesktopWindowIpc(input: {
  readonly ipcMain: IpcMainLike
  readonly logger: Logger
  readonly resolveWindow: (event: unknown) => ControlsTarget | null
}): void {
  registerWindowFullScreenStateIpc(input)
  const boundary = { ipcMain: input.ipcMain, logger: input.logger, scope: 'platform.window' }
  registerIpcHandler<undefined, DesktopWindowState>({
    ...boundary,
    channel: desktopWindowChannels.readState,
    operation: 'getDesktopWindowState',
    handler: (_command, event) => readState(input.resolveWindow(event))
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
